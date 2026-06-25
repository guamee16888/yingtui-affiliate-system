import { XMLParser } from "fast-xml-parser";
import { createStableId, createToolId } from "../ids.mjs";
import {
  DEFAULT_CONTENT_SOURCE_CONFIG,
  normalizeContentSourceConfig,
  loadSourceCandidates,
  saveSourceCandidates
} from "./config.mjs";
import { evaluateSourceCandidateQuality } from "./quality.mjs";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

export async function refreshSourceCandidates(config, warnings = []) {
  const normalized = normalizeContentSourceConfig(config);
  const enabledSources = normalized.sources.filter((source) => source.enabled);
  const existing = await loadSourceCandidates();

  if (!enabledSources.length) {
    return {
      fetchedCount: 0,
      cachedCount: existing.items?.length ?? 0,
      enabledSources: 0,
      sourceCandidates: existing
    };
  }

  const fetched = [];
  const refreshedSourceIds = new Set();

  for (const source of enabledSources) {
    try {
      fetched.push(...await fetchSource(source));
      refreshedSourceIds.add(source.id);
    } catch (error) {
      warnings.push(`Source ${source.name} unavailable: ${error.message}`);
    }
  }

  const retained = (existing.items ?? []).filter((item) => !refreshedSourceIds.has(item.source));
  const merged = mergeSourceCandidateItems(retained, fetched);
  await saveSourceCandidates({ ...existing, items: merged });

  return {
    fetchedCount: fetched.length,
    cachedCount: merged.length,
    enabledSources: enabledSources.length,
    sourceCandidates: { ...existing, items: merged }
  };
}

export function sourceCandidatesToTools(sourceCandidates, date, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const sourceById = new Map(config.sources.map((source) => [source.id, source]));

  return (sourceCandidates.items ?? [])
    .filter((item) => item.status === "active")
    .map((item) => {
      const source = sourceById.get(item.source) ?? {
        id: item.source || "",
        name: item.sourceName || item.source || "Source Candidate",
        circle: item.circle || "",
        candidateType: item.candidateType || "topic",
        excludeKeywords: []
      };
      return {
        id: item.id,
        sourceId: item.source || "",
        name: item.name,
        url: item.url,
        tagline: item.tagline || item.description,
        description: item.description || item.tagline,
        published: item.published || `${date}T00:00:00+08:00`,
        updated: item.updatedAt,
        author: item.sourceName || item.source || "source",
        sourceType: "source_feed",
        sourceName: item.sourceName || item.source || "Source Candidate",
        sourceUrl: item.sourceUrl || "",
        sourceNote: item.notes || "",
        circle: item.circle || source.circle || "",
        candidateType: item.candidateType || source.candidateType || "topic",
        sourceQuality: evaluateSourceCandidateQuality(item, source)
      };
    })
    .filter((tool) => tool.name && tool.url);
}

async function fetchSource(source) {
  if (!["rss", "atom"].includes(source.type)) throw new Error(`unsupported source type ${source.type}`);
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(10000),
    headers: { "user-agent": "yingtui-affiliate-system/0.3" }
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const entries = source.type === "atom"
    ? asArray(parsed.feed?.entry)
    : asArray(parsed.rss?.channel?.item);

  return entries.slice(0, source.maxItems).map((entry) => entryToCandidate(entry, source)).filter(Boolean);
}

function entryToCandidate(entry, source) {
  const name = stripHtml(entry.title?.["#text"] ?? entry.title ?? "").trim();
  const url = atomLink(entry) || String(entry.link?.["#text"] ?? entry.link ?? "").trim();
  const description = stripHtml(entry.summary?.["#text"] ?? entry.summary ?? entry.description?.["#text"] ?? entry.description ?? entry.content?.["#text"] ?? entry.content ?? source.qualityHint);
  if (!name || !url) return null;
  if (!passesKeywordFilters(`${name} ${description}`, source)) return null;

  const published = entry.published ?? entry.pubDate ?? entry.updated ?? new Date().toISOString();
  const toolId = createToolId(name, url);

  return {
    id: createStableId("source_candidate", [source.id, toolId]),
    toolId,
    name,
    url,
    tagline: description.slice(0, 180),
    description,
    source: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    circle: source.circle,
    candidateType: source.candidateType,
    published,
    status: "active",
    notes: source.qualityHint,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function passesKeywordFilters(text, source) {
  const lower = text.toLowerCase();
  const includes = source.includeKeywords ?? [];
  const excludes = source.excludeKeywords ?? [];

  if (includes.length && !includes.some((keyword) => lower.includes(String(keyword).toLowerCase()))) return false;
  if (excludes.some((keyword) => lower.includes(String(keyword).toLowerCase()))) return false;
  return true;
}

function mergeSourceCandidateItems(existing, incoming) {
  const byTool = new Map();
  for (const item of [...existing, ...incoming]) {
    const toolId = item.toolId || createToolId(item.name, item.url);
    const previous = byTool.get(toolId);
    byTool.set(toolId, previous ? { ...previous, ...item, createdAt: previous.createdAt, updatedAt: new Date().toISOString() } : { ...item, toolId });
  }
  return Array.from(byTool.values()).sort((a, b) => String(b.published).localeCompare(String(a.published)));
}

function atomLink(entry) {
  const links = asArray(entry.link);
  const alternate = links.find((link) => link.rel === "alternate") ?? links[0];
  return String(alternate?.href ?? "").trim();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}
