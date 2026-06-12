import { XMLParser } from "fast-xml-parser";
import { createStableId, createToolId } from "./ids.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";

export const CONTENT_SOURCES_PATH = "config/content-sources.json";
export const SOURCE_CANDIDATES_PATH = "data/source-candidates.json";

export const DEFAULT_CONTENT_SOURCE_CONFIG = {
  version: 1,
  dailyTargets: {
    accounts: 20,
    postsPerAccount: 10,
    minimumQualityScore: 18
  },
  circles: [
    { id: "ai_startups", name: "AI startup circle", keywords: ["AI", "agent", "workflow", "automation"] },
    { id: "indie_hackers", name: "Indie hacker circle", keywords: ["indie", "builder", "launch", "micro SaaS"] },
    { id: "saas_founders", name: "SaaS founder circle", keywords: ["SaaS", "B2B", "pricing", "growth"] },
    { id: "crypto_builders", name: "Crypto builder circle", keywords: ["crypto", "web3", "wallet", "onchain"] }
  ],
  sources: []
};

export const DEFAULT_SOURCE_CANDIDATES = {
  version: 1,
  updatedAt: "",
  items: []
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

export function normalizeContentSourceConfig(config = DEFAULT_CONTENT_SOURCE_CONFIG) {
  const circles = Array.isArray(config.circles) ? config.circles : DEFAULT_CONTENT_SOURCE_CONFIG.circles;
  const sources = Array.isArray(config.sources) ? config.sources : [];

  return {
    ...DEFAULT_CONTENT_SOURCE_CONFIG,
    ...config,
    dailyTargets: {
      ...DEFAULT_CONTENT_SOURCE_CONFIG.dailyTargets,
      ...(config.dailyTargets ?? {})
    },
    circles: circles.map((circle) => ({
      id: String(circle.id || "").trim(),
      name: String(circle.name || circle.id || "").trim(),
      keywords: Array.isArray(circle.keywords) ? circle.keywords : []
    })).filter((circle) => circle.id),
    sources: sources.map(normalizeSource).filter((source) => source.id && source.url)
  };
}

export async function loadContentSourceConfig(warnings = []) {
  try {
    return normalizeContentSourceConfig(await readJson(CONTENT_SOURCES_PATH, DEFAULT_CONTENT_SOURCE_CONFIG));
  } catch (error) {
    warnings.push(`Content source config failed: ${error.message}. Using built-in defaults.`);
    return normalizeContentSourceConfig(DEFAULT_CONTENT_SOURCE_CONFIG);
  }
}

export async function loadSourceCandidates() {
  return readJson(SOURCE_CANDIDATES_PATH, DEFAULT_SOURCE_CANDIDATES);
}

export async function saveSourceCandidates(data) {
  await writeJsonAtomic(SOURCE_CANDIDATES_PATH, {
    ...DEFAULT_SOURCE_CANDIDATES,
    ...data,
    updatedAt: new Date().toISOString(),
    items: Array.isArray(data.items) ? data.items : []
  });
}

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

export function sourceCandidatesToTools(sourceCandidates, date) {
  return (sourceCandidates.items ?? [])
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: item.id,
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
      circle: item.circle || "",
      candidateType: item.candidateType || "topic"
    }))
    .filter((tool) => tool.name && tool.url);
}

export function buildSupplyPlan({ date, scored = [], accountStrategy = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const targetAccounts = Number(config.dailyTargets.accounts || accountStrategy?.summary?.activeAccounts || 0);
  const targetPerAccount = Number(config.dailyTargets.postsPerAccount || 0);
  const minimumQualityScore = Number(config.dailyTargets.minimumQualityScore || 18);
  const activeAccounts = accountStrategy?.accounts ?? [];
  const qualified = scored.filter((item) => item.followUpAction !== "skip" && Number(item.score) >= minimumQualityScore);
  const uniqueQualifiedTools = uniqueByTool(qualified);
  const possibleDrafts = uniqueQualifiedTools.length * 5;
  const targetDrafts = targetAccounts * targetPerAccount;
  const accountCoverage = activeAccounts.map((account) => {
    const matches = uniqueQualifiedTools.filter((item) => accountMatchesItem(account, item));
    const availableDrafts = Math.min(targetPerAccount, matches.length);
    return {
      accountId: account.id,
      displayName: account.displayName,
      category: account.category,
      targetPosts: targetPerAccount,
      availableDrafts,
      qualifiedTools: matches.length,
      gap: Math.max(0, targetPerAccount - availableDrafts),
      status: availableDrafts >= targetPerAccount ? "covered" : "short"
    };
  });
  const circleCoverage = config.circles.map((circle) => {
    const items = uniqueQualifiedTools.filter((item) => itemMatchesCircle(item, circle));
    return {
      circleId: circle.id,
      name: circle.name,
      qualifiedTools: items.length,
      possibleDrafts: items.length * 5
    };
  });
  const totalGap = Math.max(0, targetDrafts - possibleDrafts);
  const accountShort = accountCoverage.some((account) => account.status === "short");
  const status = totalGap === 0 && !accountShort ? "covered" : "short";

  return {
    date,
    targetAccounts,
    targetPerAccount,
    targetDrafts,
    minimumQualityScore,
    qualifiedTools: uniqueQualifiedTools.length,
    possibleDrafts,
    totalGap,
    status,
    note: status === "covered"
      ? "Supply is enough for the configured account target, subject to manual review."
      : "Supply is short for at least one account or circle. Add more source candidates instead of lowering quality just to fill slots.",
    accountCoverage,
    circleCoverage
  };
}

export function buildSourceQualityQueue({ supplyPlan = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  if (!supplyPlan) {
    return {
      summary: { items: 0, totalNeededCandidates: 0 },
      items: []
    };
  }

  const accountGaps = (supplyPlan.accountCoverage ?? [])
    .filter((account) => Number(account.gap) > 0)
    .sort((a, b) => Number(b.gap) - Number(a.gap));

  const items = config.circles.map((circle) => {
    const affectedAccounts = accountGaps.filter((account) => accountLooksLikeCircle(account, circle));
    const circleCoverage = (supplyPlan.circleCoverage ?? []).find((item) => item.circleId === circle.id);
    const accountGap = affectedAccounts.reduce((sum, account) => sum + Number(account.gap || 0), 0);
    const baselineNeed = Math.max(0, Math.ceil(Number(supplyPlan.targetPerAccount || 10) * 2) - Number(circleCoverage?.qualifiedTools || 0));
    const neededCandidates = Math.max(accountGap, baselineNeed);

    return {
      circleId: circle.id,
      circleName: circle.name,
      priorityScore: neededCandidates + affectedAccounts.length * 2,
      neededCandidates,
      currentQualifiedTools: Number(circleCoverage?.qualifiedTools || 0),
      affectedAccounts: affectedAccounts.map((account) => ({
        accountId: account.accountId,
        displayName: account.displayName,
        gap: account.gap,
        category: account.category
      })),
      recommendedSources: recommendedSourcesForCircle(config, circle),
      searchQueries: searchQueriesForCircle(circle),
      importHint: `Add ${neededCandidates || 5} fresh ${circle.name} candidates with clear buyer, narrow pain, and a real URL.`
    };
  })
    .filter((item) => item.neededCandidates > 0 || item.affectedAccounts.length > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.circleName.localeCompare(b.circleName));

  return {
    summary: {
      items: items.length,
      totalNeededCandidates: items.reduce((sum, item) => sum + item.neededCandidates, 0),
      topCircle: items[0]?.circleName ?? ""
    },
    items
  };
}

export function buildSourceImportPackRows({ sourceQualityQueue = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG, totalRows = 100, date = "" }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const queueItems = sourceQualityQueue?.items?.length
    ? sourceQualityQueue.items
    : config.circles.map((circle) => ({
      circleId: circle.id,
      circleName: circle.name,
      neededCandidates: Math.ceil(totalRows / Math.max(1, config.circles.length)),
      searchQueries: searchQueriesForCircle(circle)
    }));
  const weighted = distributeRows(queueItems, totalRows);
  const rows = [];

  for (const item of weighted) {
    for (let index = 0; index < item.rows; index += 1) {
      rows.push({
        name: "",
        url: "",
        tagline: "",
        source: "manual_research",
        circle: item.circleId,
        candidateType: index % 3 === 0 ? "topic" : "product",
        sourceUrl: "",
        published: date,
        notes: `Find from: ${item.searchQueries[index % item.searchQueries.length] ?? item.circleName}`
      });
    }
  }

  return rows.slice(0, totalRows);
}

export function sourceImportRowsToCsv(rows) {
  const headers = ["name", "url", "tagline", "source", "circle", "candidateType", "sourceUrl", "published", "notes"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))
  ].join("\n");
}

export function renderSourceQualityQueueMarkdown(queue) {
  if (!queue?.items?.length) {
    return "# Source Quality Queue\n\nNo source gaps detected under the current target.\n";
  }

  return `# Source Quality Queue

- Queue items: ${queue.summary.items}
- Needed candidates: ${queue.summary.totalNeededCandidates}
- Top gap: ${queue.summary.topCircle || "none"}

${queue.items.map((item, index) => `## ${index + 1}. ${item.circleName}

- Needed candidates: ${item.neededCandidates}
- Current qualified tools: ${item.currentQualifiedTools}
- Affected accounts: ${item.affectedAccounts.length ? item.affectedAccounts.map((account) => `${account.displayName} gap ${account.gap}`).join("; ") : "none"}
- Import hint: ${item.importHint}

Search queries:
${item.searchQueries.map((query) => `- ${query}`).join("\n")}

Recommended configured sources:
${item.recommendedSources.length ? item.recommendedSources.map((source) => `- ${source.name} (${source.enabled ? "enabled" : "disabled"}) — ${source.url}`).join("\n") : "- No configured source yet. Add one to config/content-sources.json after testing it."}`).join("\n\n")}
`;
}

function normalizeSource(source) {
  return {
    id: String(source.id || "").trim(),
    name: String(source.name || source.id || "").trim(),
    circle: String(source.circle || "").trim(),
    url: String(source.url || "").trim(),
    type: String(source.type || "rss").trim(),
    candidateType: String(source.candidateType || "topic").trim(),
    enabled: source.enabled === true,
    maxItems: Number(source.maxItems || 20),
    qualityHint: String(source.qualityHint || "").trim(),
    includeKeywords: Array.isArray(source.includeKeywords) ? source.includeKeywords : [],
    excludeKeywords: Array.isArray(source.excludeKeywords) ? source.excludeKeywords : []
  };
}

function accountLooksLikeCircle(account, circle) {
  const text = `${account.displayName ?? ""} ${account.category ?? ""} ${account.accountId ?? ""}`.toLowerCase();
  const anchors = {
    ai_startups: ["ai tools", "ai founder", "ai startup", "ai agent", "agent ops", "sales support ai"],
    indie_hackers: ["indie", "build in public", "affiliate", "monetization", "side project"],
    saas_founders: ["saas", "b2b"],
    crypto_builders: ["crypto", "web3", "onchain", "wallet"]
  };
  return text.includes(circle.id.replace(/_/g, " "))
    || (anchors[circle.id] ?? []).some((anchor) => text.includes(anchor));
}

function recommendedSourcesForCircle(config, circle) {
  return (config.sources ?? [])
    .filter((source) => source.circle === circle.id)
    .map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      enabled: source.enabled
    }));
}

function searchQueriesForCircle(circle) {
  const defaults = {
    ai_startups: [
      "\"AI startup\" launch new tool",
      "\"AI agent\" founder workflow",
      "\"LLM\" \"Product Hunt\" launch",
      "\"AI automation\" \"pricing\" startup",
      "\"AI tool\" \"founder\" \"waitlist\""
    ],
    indie_hackers: [
      "\"micro SaaS\" launch",
      "\"indie hacker\" \"revenue\"",
      "\"build in public\" \"launched\"",
      "\"solo founder\" \"pricing\"",
      "\"side project\" \"SaaS\" \"users\""
    ],
    saas_founders: [
      "\"SaaS pricing\" \"case study\"",
      "\"B2B SaaS\" \"onboarding\"",
      "\"SaaS founder\" \"churn\"",
      "\"PLG\" \"activation\" \"SaaS\"",
      "\"SaaS\" \"pricing page\" \"launch\""
    ],
    crypto_builders: [
      "\"crypto wallet\" \"developer\"",
      "\"onchain\" \"tool\" launch",
      "\"DeFi\" \"dashboard\"",
      "\"stablecoin\" \"infrastructure\"",
      "\"web3\" \"founder\" \"product\""
    ]
  };

  return defaults[circle.id] ?? (circle.keywords ?? []).slice(0, 5).map((keyword) => `"${keyword}" startup tool`);
}

function distributeRows(items, totalRows) {
  if (!items.length) return [];
  const totalNeed = items.reduce((sum, item) => sum + Math.max(1, Number(item.neededCandidates || 0)), 0);
  let allocated = 0;
  const rows = items.map((item) => {
    const count = Math.max(1, Math.floor(totalRows * Math.max(1, Number(item.neededCandidates || 0)) / totalNeed));
    allocated += count;
    return { ...item, rows: count };
  });
  let cursor = 0;
  while (allocated < totalRows) {
    rows[cursor % rows.length].rows += 1;
    allocated += 1;
    cursor += 1;
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
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

function accountMatchesItem(account, item) {
  const text = `${item.tool?.name ?? ""} ${item.tool?.description ?? ""} ${item.tool?.circle ?? ""} ${item.angle?.audience ?? ""} ${item.angle?.outcome ?? ""}`.toLowerCase();
  return (account.keywords ?? []).some((keyword) => text.includes(String(keyword).toLowerCase()))
    || (account.contentPillars ?? []).some((pillar) => text.includes(String(pillar).toLowerCase()));
}

function itemMatchesCircle(item, circle) {
  const text = `${item.tool?.name ?? ""} ${item.tool?.description ?? ""} ${item.tool?.circle ?? ""}`.toLowerCase();
  return text.includes(circle.id.replace(/_/g, " ")) || (circle.keywords ?? []).some((keyword) => text.includes(String(keyword).toLowerCase()));
}

function uniqueByTool(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = item.toolId || createToolId(item.tool?.name, item.tool?.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
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
