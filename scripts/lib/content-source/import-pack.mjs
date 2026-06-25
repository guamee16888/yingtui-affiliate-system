import { DEFAULT_CONTENT_SOURCE_CONFIG, normalizeContentSourceConfig } from "./config.mjs";
import { discoveryLinksForQuery } from "./discovery.mjs";
import { searchQueriesForCircle } from "./helpers.mjs";

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
      const query = item.searchQueries[index % item.searchQueries.length] ?? item.circleName;
      const research = sourceResearchTask({
        item,
        query,
        index,
        date
      });
      rows.push({
        researchId: research.researchId,
        priority: research.priority,
        name: "",
        url: "",
        tagline: "",
        source: "manual_research",
        circle: item.circleId,
        candidateType: index % 3 === 0 ? "topic" : "product",
        sourceUrl: research.researchUrl,
        published: date,
        researchProvider: research.researchProvider,
        researchQuery: query,
        researchUrl: research.researchUrl,
        acceptanceChecklist: research.acceptanceChecklist,
        notes: research.notes
      });
    }
  }

  return rows.slice(0, totalRows);
}

export function buildSourceImportPack({
  date,
  sourceQualityQueue = null,
  contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG,
  totalRows = 100,
  csvPath = "",
  guidePath = ""
}) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const rows = buildSourceImportPackRows({ sourceQualityQueue, contentSourceConfig: config, totalRows, date });
  const rowsByCircle = summarizeRowsByCircle(rows, sourceQualityQueue, config);
  const rowsByCandidateType = summarizeRows(rows, "candidateType");
  const rowsByResearchProvider = summarizeRows(rows, "researchProvider");
  const collectionPlan = buildSourceCollectionPlan(rowsByCircle, rowsByResearchProvider);
  const priorityGaps = (sourceQualityQueue?.items ?? []).map((item) => ({
    circleId: item.circleId,
    circleName: item.circleName,
    neededCandidates: Number(item.neededCandidates || 0),
    currentQualifiedTools: Number(item.currentQualifiedTools || 0),
    assignedRows: rows.filter((row) => row.circle === item.circleId).length,
    affectedAccounts: item.affectedAccounts ?? [],
    importHint: item.importHint || ""
  }));

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      totalRows: rows.length,
      circles: rowsByCircle.length,
      productRows: rows.filter((row) => row.candidateType === "product").length,
      topicRows: rows.filter((row) => row.candidateType === "topic").length,
      rowsNeedingResearch: rows.filter((row) => !row.name || !row.url || !row.tagline).length,
      rowsWithResearchUrl: rows.filter((row) => row.researchUrl).length,
      totalNeededCandidates: Number(sourceQualityQueue?.summary?.totalNeededCandidates ?? priorityGaps.reduce((sum, item) => sum + item.neededCandidates, 0)),
      topCircle: sourceQualityQueue?.summary?.topCircle || rowsByCircle[0]?.circleName || "",
      generatedFromQueue: Boolean(sourceQualityQueue?.items?.length),
      csvPath,
      guidePath
    },
    rowsByCircle,
    rowsByCandidateType,
    rowsByResearchProvider,
    collectionPlan,
    priorityGaps,
    rows
  };
}

function sourceResearchTask({ item, query, index, date }) {
  const links = discoveryLinksForQuery(query, item.circleId);
  const preferred = preferredResearchLink(links, item.circleId, index);
  const priority = sourceResearchPriority(item, index);
  return {
    researchId: [date || "today", item.circleId, String(index + 1).padStart(3, "0")].join("-"),
    priority,
    researchProvider: preferred.label,
    researchUrl: preferred.url,
    acceptanceChecklist: sourceResearchChecklist(item.circleId).join(" | "),
    notes: [
      `Find from: ${query}`,
      `Open: ${preferred.label}`,
      `Priority: ${priority}`,
      `Accept only if: ${sourceResearchChecklist(item.circleId).join("; ")}`
    ].join(" | ")
  };
}

function preferredResearchLink(links, circleId, index) {
  const preferredLabels = circleId === "crypto_builders"
    ? ["X live search", "CoinDesk search", "Google recent search", "HN Algolia"]
    : circleId === "ai_startups"
      ? ["Product Hunt search", "X live search", "Google recent search", "HN Algolia"]
      : ["X live search", "Google recent search", "HN Algolia"];
  const ordered = preferredLabels
    .map((label) => links.find((link) => link.label === label))
    .filter(Boolean);
  const fallback = links.filter((link) => !ordered.some((item) => item.label === link.label));
  const candidates = [...ordered, ...fallback];
  return candidates[index % Math.max(1, candidates.length)] ?? { label: "Manual search", url: `https://www.google.com/search?q=${encodeURIComponent(links[0]?.query ?? "")}` };
}

function sourceResearchPriority(item, index) {
  const needed = Number(item.neededCandidates || 0);
  if (needed >= 25 && index < 10) return "P0";
  if (needed >= 10 && index < 8) return "P1";
  return "P2";
}

function sourceResearchChecklist(circleId) {
  const common = [
    "real URL",
    "clear audience",
    "one narrow pain",
    "fresh enough or evergreen"
  ];
  if (circleId === "crypto_builders") return [...common, "builder or infrastructure angle", "not pure price drama"];
  if (circleId === "indie_hackers") return [...common, "solo founder or revenue angle"];
  if (circleId === "saas_founders") return [...common, "SaaS operator lesson"];
  if (circleId === "ai_startups") return [...common, "AI product or founder signal"];
  return common;
}

function buildSourceCollectionPlan(rowsByCircle, rowsByResearchProvider) {
  const topCircle = rowsByCircle[0];
  const topProvider = rowsByResearchProvider[0];
  const firstBatch = rowsByCircle.slice(0, 3).map((item) => ({
    circleId: item.circleId,
    circleName: item.circleName,
    targetRows: Math.min(10, item.rows),
    neededCandidates: item.neededCandidates,
    instruction: `Collect ${Math.min(10, item.rows)} real candidates for ${item.circleName}, then import only the rows with name/url/tagline filled.`
  }));
  return {
    headline: topCircle ? `Start with ${topCircle.circleName}; it has ${topCircle.rows} assigned research rows.` : "No source collection gap detected.",
    firstBatch,
    preferredProvider: topProvider?.researchProvider ?? "",
    rule: "Fill name, url, and tagline. Leave weak or duplicate rows blank."
  };
}

function summarizeRowsByCircle(rows, sourceQualityQueue, config) {
  const queueByCircle = new Map((sourceQualityQueue?.items ?? []).map((item) => [item.circleId, item]));
  const circleById = new Map(config.circles.map((circle) => [circle.id, circle]));
  return summarizeRows(rows, "circle").map((item) => {
    const queueItem = queueByCircle.get(item.circle) ?? {};
    const circle = circleById.get(item.circle) ?? {};
    return {
      circleId: item.circle,
      circleName: queueItem.circleName || circle.name || item.circle,
      rows: item.rows,
      neededCandidates: Number(queueItem.neededCandidates || 0),
      currentQualifiedTools: Number(queueItem.currentQualifiedTools || 0),
      affectedAccounts: queueItem.affectedAccounts ?? [],
      importHint: queueItem.importHint || ""
    };
  }).sort((a, b) => Number(b.rows) - Number(a.rows) || a.circleName.localeCompare(b.circleName));
}

function summarizeRows(rows, key) {
  const counts = rows.reduce((map, row) => {
    const value = String(row[key] || "unknown");
    map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  }, new Map());
  return [...counts.entries()]
    .map(([value, rows]) => ({ [key]: value, rows }))
    .sort((a, b) => Number(b.rows) - Number(a.rows) || String(a[key]).localeCompare(String(b[key])));
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
