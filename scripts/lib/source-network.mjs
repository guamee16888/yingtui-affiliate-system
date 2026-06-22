import path from "node:path";
import { readJson, rootDir, writeJsonAtomic, writeTextAtomic } from "./file-store.mjs";
import { emptyCollection, normalizeCollection, CORE_COLLECTIONS } from "./core-data.mjs";
import { SOURCE_CANDIDATES_PATH, DEFAULT_SOURCE_CANDIDATES } from "./content-source-system.mjs";
import { SOURCE_LANE_FILES } from "./source-lanes.mjs";

export const SOURCE_NETWORK_CONFIG_PATH = "config/source-network.json";
export const SOURCE_REGISTRY_PATH = "data/source-registry.json";
export const SOURCE_QUALITY_PATH = "data/source-quality.json";
export const SOURCE_SUPPLY_PATH = "data/source-supply.json";

export const DEFAULT_SOURCE_NETWORK = {
  version: 1,
  updatedAt: "",
  target: {
    accounts: 100,
    inventoryPerAccount: 10,
    requiredInventory: 1000,
    theme: "AI x Crypto",
    minimumQualityScore: 70
  },
  lanes: [],
  sources: []
};

export async function loadSourceNetworkConfig() {
  const runtimeConfig = await readJson(SOURCE_NETWORK_CONFIG_PATH, null);
  const repoConfig = runtimeConfig
    ?? await readJson(path.join(rootDir, SOURCE_NETWORK_CONFIG_PATH), null)
    ?? sourceNetworkConfigFromRegistry(await readJson(SOURCE_REGISTRY_PATH, null))
    ?? DEFAULT_SOURCE_NETWORK;
  return normalizeSourceNetworkConfig(repoConfig);
}

export function normalizeSourceNetworkConfig(config = DEFAULT_SOURCE_NETWORK) {
  const target = { ...DEFAULT_SOURCE_NETWORK.target, ...(config.target ?? {}) };
  target.accounts = Number(target.accounts || 100);
  target.inventoryPerAccount = Number(target.inventoryPerAccount || 10);
  target.requiredInventory = Number(target.requiredInventory || target.accounts * target.inventoryPerAccount);
  target.minimumQualityScore = Number(target.minimumQualityScore || 70);

  const lanes = (Array.isArray(config.lanes) ? config.lanes : [])
    .map((lane) => ({
      laneId: String(lane.laneId || "").trim(),
      name: String(lane.name || lane.laneId || "").trim(),
      accountTarget: Number(lane.accountTarget || 0),
      keywords: Array.isArray(lane.keywords) ? lane.keywords : [],
      adFit: Array.isArray(lane.adFit) ? lane.adFit : []
    }))
    .filter((lane) => lane.laneId);

  const laneIds = new Set(lanes.map((lane) => lane.laneId));
  const sources = (Array.isArray(config.sources) ? config.sources : [])
    .map((source) => ({
      sourceId: String(source.sourceId || source.id || "").trim(),
      name: String(source.name || source.sourceId || source.id || "").trim(),
      tier: normalizeTier(source.tier),
      type: String(source.type || "public").trim(),
      laneIds: (Array.isArray(source.laneIds) ? source.laneIds : [source.lane || source.circle])
        .map((laneId) => String(laneId || "").trim())
        .filter((laneId) => laneIds.has(laneId)),
      status: String(source.status || "planned").trim(),
      qualityScore: clampScore(source.qualityScore),
      freshnessScore: clampScore(source.freshnessScore),
      reviewPolicy: String(source.reviewPolicy || (source.tier === "L2" ? "manual_review_only" : "direct_candidate")).trim(),
      requiresApiKey: Boolean(source.requiresApiKey),
      url: String(source.url || "").trim(),
      notes: String(source.notes || "").trim()
    }))
    .filter((source) => source.sourceId);

  return {
    ...DEFAULT_SOURCE_NETWORK,
    ...config,
    target,
    lanes,
    sources
  };
}

export async function saveSourceNetworkConfig(config = DEFAULT_SOURCE_NETWORK) {
  const normalized = normalizeSourceNetworkConfig({
    ...config,
    updatedAt: new Date().toISOString()
  });
  await writeJsonAtomic(SOURCE_NETWORK_CONFIG_PATH, normalized);
  return normalized;
}

export async function upsertSourceNetworkSource(input = {}) {
  const config = await loadSourceNetworkConfig();
  const nextConfig = buildSourceNetworkConfigWithSource(config, input);
  await saveSourceNetworkConfig(nextConfig);
  const reports = await buildSourceNetworkReports();
  await writeSourceNetworkReports(reports);
  return reports;
}

export async function updateSourceNetworkSourceStatus(input = {}) {
  const config = await loadSourceNetworkConfig();
  const sourceId = String(input.sourceId || "").trim();
  if (!sourceId) throw new Error("sourceId is required.");
  const status = normalizeSourceStatus(input.status);
  const index = config.sources.findIndex((source) => source.sourceId === sourceId);
  if (index === -1) throw new Error(`Unknown source: ${sourceId}`);
  const sources = config.sources.map((source) => source.sourceId === sourceId ? { ...source, status } : source);
  await saveSourceNetworkConfig({ ...config, sources });
  const reports = await buildSourceNetworkReports();
  await writeSourceNetworkReports(reports);
  return reports;
}

export async function refreshSourceNetworkReports() {
  const reports = await buildSourceNetworkReports();
  await writeSourceNetworkReports(reports);
  return reports;
}

export function buildSourceNetworkConfigWithSource(config = DEFAULT_SOURCE_NETWORK, input = {}) {
  const normalized = normalizeSourceNetworkConfig(config);
  const source = normalizeEditableSource(input, normalized);
  const sources = normalized.sources.filter((item) => item.sourceId !== source.sourceId);
  return normalizeSourceNetworkConfig({
    ...normalized,
    updatedAt: new Date().toISOString(),
    sources: [...sources, source]
  });
}

export async function buildSourceNetworkReports({ date = todayDate() } = {}) {
  const [config, sourceCandidates, rawCandidates, sourceRuns, tools, topics, copyLibrary, postTasks] = await Promise.all([
    loadSourceNetworkConfig(),
    readJson(SOURCE_CANDIDATES_PATH, DEFAULT_SOURCE_CANDIDATES),
    readJson(SOURCE_LANE_FILES.rawCandidates, emptyCollection()),
    readJson(SOURCE_LANE_FILES.sourceRuns, emptyCollection()),
    readJson(CORE_COLLECTIONS.tools, emptyCollection()),
    readJson(CORE_COLLECTIONS.topics, emptyCollection()),
    readJson(CORE_COLLECTIONS.copyLibrary, emptyCollection()),
    readJson(CORE_COLLECTIONS.postTasks, emptyCollection())
  ]);

  return buildSourceNetworkReportsFromData({
    date,
    config,
    sourceCandidates,
    rawCandidates,
    sourceRuns,
    tools,
    topics,
    copyLibrary,
    postTasks
  });
}

export function buildSourceNetworkReportsFromData({
  date = todayDate(),
  config = DEFAULT_SOURCE_NETWORK,
  sourceCandidates = DEFAULT_SOURCE_CANDIDATES,
  rawCandidates = emptyCollection(),
  sourceRuns = emptyCollection(),
  tools = emptyCollection(),
  topics = emptyCollection(),
  copyLibrary = emptyCollection(),
  postTasks = emptyCollection()
} = {}) {
  const normalized = normalizeSourceNetworkConfig(config);
  const candidateItems = normalizeSourceCandidateItems(sourceCandidates);
  const rawItems = normalizeCollection(rawCandidates).items;
  const runs = normalizeCollection(sourceRuns).items;
  const registry = buildSourceRegistry({ date, config: normalized, sourceCandidates: candidateItems, rawCandidates: rawItems, sourceRuns: runs });
  const quality = buildSourceQualityDashboard({ date, config: normalized, registry, sourceCandidates: candidateItems, rawCandidates: rawItems });
  const supply = buildSourceSupplyReport({
    date,
    config: normalized,
    registry,
    quality,
    sourceCandidates: candidateItems,
    rawCandidates: rawItems,
    tools: normalizeCollection(tools).items,
    topics: normalizeCollection(topics).items,
    copyLibrary: normalizeCollection(copyLibrary).items,
    postTasks: normalizeCollection(postTasks).items
  });

  return { config: normalized, registry, quality, supply };
}

export function buildSourceRegistry({ date = todayDate(), config, sourceCandidates = [], rawCandidates = [], sourceRuns = [] }) {
  const candidatesBySource = groupBy([...sourceCandidates, ...rawCandidates], (item) => candidateSourceKey(item, config));
  const runsBySource = groupBy(sourceRuns, (run) => String(run.sourceId || run.connectorId || "").trim());
  const sources = config.sources.map((source) => {
    const candidates = candidatesBySource.get(source.sourceId) ?? [];
    const runs = runsBySource.get(source.sourceId) ?? [];
    const duplicateRate = candidates.length ? duplicateCount(candidates) / candidates.length : 0;
    const candidateCount = candidates.length;
    const lastRun = latestBy(runs, (run) => run.finishedAt || run.createdAt || "");
    return {
      sourceId: source.sourceId,
      name: source.name,
      tier: source.tier,
      type: source.type,
      laneIds: source.laneIds,
      status: source.status,
      reviewPolicy: source.reviewPolicy,
      canDirectlyGenerateTasks: source.reviewPolicy !== "manual_review_only" && source.tier !== "L2",
      requiresApiKey: source.requiresApiKey,
      url: source.url,
      qualityScore: source.qualityScore,
      freshnessScore: source.freshnessScore,
      duplicateRate: roundRate(duplicateRate),
      candidateCount,
      latestRunAt: lastRun?.finishedAt || lastRun?.createdAt || "",
      notes: source.notes
    };
  });

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      totalSources: sources.length,
      l0Premium: sources.filter((source) => source.tier === "L0").length,
      l1Public: sources.filter((source) => source.tier === "L1").length,
      l2Community: sources.filter((source) => source.tier === "L2").length,
      activeSources: sources.filter((source) => source.status === "active").length,
      directCandidateSources: sources.filter((source) => source.canDirectlyGenerateTasks).length,
      manualReviewOnlySources: sources.filter((source) => !source.canDirectlyGenerateTasks).length
    },
    lanes: config.lanes,
    sources
  };
}

export function buildSourceQualityDashboard({ date = todayDate(), config, registry, sourceCandidates = [], rawCandidates = [] }) {
  const rawItems = rawCandidates;
  const sourceItems = sourceCandidates;
  const allCandidates = [...sourceItems, ...rawItems];
  const sourceRows = registry.sources.map((source) => {
    const candidates = allCandidates.filter((item) => candidateSourceKey(item, config) === source.sourceId);
    const rejected = candidates.filter(isRejectedCandidate).length;
    const valid = candidates.filter(isValidCandidate).length;
    const duplicates = duplicateCount(candidates);
    return {
      sourceId: source.sourceId,
      name: source.name,
      tier: source.tier,
      type: source.type,
      laneIds: source.laneIds,
      qualityScore: source.qualityScore,
      freshnessScore: source.freshnessScore,
      candidateCount: candidates.length,
      effectiveCandidates: valid,
      rejectedCandidates: rejected,
      duplicateCandidates: duplicates,
      rejectionRate: roundRate(candidates.length ? rejected / candidates.length : 0),
      duplicateRate: roundRate(candidates.length ? duplicates / candidates.length : 0),
      status: sourceQualityStatus({ source, candidates, valid, rejected, duplicates }),
      recommendation: sourceQualityRecommendation({ source, candidates, valid, rejected, duplicates })
    };
  });
  const lanes = config.lanes.map((lane) => {
    const laneCandidates = allCandidates.filter((item) => candidateLaneIds(item).includes(lane.laneId));
    const effectiveCandidates = laneCandidates.filter(isValidCandidate).length;
    const configuredSources = registry.sources.filter((source) => source.laneIds.includes(lane.laneId));
    return {
      laneId: lane.laneId,
      name: lane.name,
      accountTarget: lane.accountTarget,
      configuredSources: configuredSources.length,
      activeSources: configuredSources.filter((source) => source.status === "active").length,
      totalCandidates: laneCandidates.length,
      effectiveCandidates,
      rejectedCandidates: laneCandidates.filter(isRejectedCandidate).length,
      coverageRate: roundRate(effectiveCandidates / Math.max(1, lane.accountTarget * config.target.inventoryPerAccount)),
      status: effectiveCandidates >= lane.accountTarget * config.target.inventoryPerAccount ? "covered" : "short"
    };
  });

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      totalCandidates: allCandidates.length,
      effectiveCandidates: allCandidates.filter(isValidCandidate).length,
      rejectedCandidates: allCandidates.filter(isRejectedCandidate).length,
      duplicateCandidates: duplicateCount(allCandidates),
      rejectionRate: roundRate(allCandidates.length ? allCandidates.filter(isRejectedCandidate).length / allCandidates.length : 0),
      duplicateRate: roundRate(allCandidates.length ? duplicateCount(allCandidates) / allCandidates.length : 0),
      laneCoverage: roundRate(lanes.filter((lane) => lane.status === "covered").length / Math.max(1, lanes.length))
    },
    sources: sourceRows,
    lanes,
    recommendations: sourceNetworkRecommendations({ sourceRows, lanes, registry })
  };
}

export function buildSourceSupplyReport({ date = todayDate(), config, registry, quality, sourceCandidates = [], rawCandidates = [], tools = [], topics = [], copyLibrary = [], postTasks = [] }) {
  const requiredInventory = Number(config.target.requiredInventory || config.target.accounts * config.target.inventoryPerAccount);
  const taskInventory = postTasks.filter(isInventoryTask).length;
  const copyInventory = copyLibrary.filter((item) => item.status !== "archived").length;
  const inventoryContext = buildInventoryContext({ tools, topics });
  const directCandidates = [...sourceCandidates, ...rawCandidates].filter((item) => {
    if (!isValidCandidate(item)) return false;
    const source = registry.sources.find((entry) => entry.sourceId === candidateSourceKey(item));
    return !source || source.canDirectlyGenerateTasks;
  }).length;
  const reviewOnlyCandidates = [...sourceCandidates, ...rawCandidates].filter((item) => {
    if (!isValidCandidate(item)) return false;
    const source = registry.sources.find((entry) => entry.sourceId === candidateSourceKey(item));
    return source && !source.canDirectlyGenerateTasks;
  }).length;
  const currentInventory = Math.max(taskInventory, copyInventory);
  const candidatePotentialInventory = directCandidates * 3;
  const projectedInventory = currentInventory + candidatePotentialInventory;
  const inventoryGap = Math.max(0, requiredInventory - currentInventory);
  const projectedGap = Math.max(0, requiredInventory - projectedInventory);
  const lanes = config.lanes.map((lane) => {
    const required = lane.accountTarget * config.target.inventoryPerAccount;
    const tasks = postTasks.filter((task) => inventoryLaneIds(task, inventoryContext).includes(lane.laneId) && isInventoryTask(task)).length;
    const copies = copyLibrary.filter((copy) => inventoryLaneIds(copy, inventoryContext).includes(lane.laneId) && copy.status !== "archived").length;
    const candidates = [...sourceCandidates, ...rawCandidates].filter((item) => candidateLaneIds(item).includes(lane.laneId) && isValidCandidate(item) && canDirectlyUseCandidate(item, registry)).length;
    const inventory = Math.max(tasks, copies);
    return {
      laneId: lane.laneId,
      name: lane.name,
      accountTarget: lane.accountTarget,
      requiredInventory: required,
      currentInventory: inventory,
      directCandidateCount: candidates,
      projectedInventory: inventory + candidates * 3,
      gap: Math.max(0, required - inventory),
      projectedGap: Math.max(0, required - inventory - candidates * 3),
      status: inventory >= required ? "covered" : "short"
    };
  });

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    target: config.target,
    summary: {
      targetAccounts: config.target.accounts,
      inventoryPerAccount: config.target.inventoryPerAccount,
      requiredInventory,
      currentInventory,
      taskInventory,
      copyInventory,
      directCandidates,
      reviewOnlyCandidates,
      candidatePotentialInventory,
      projectedInventory,
      inventoryGap,
      projectedGap,
      status: inventoryGap === 0 ? "covered" : "short"
    },
    lanes,
    budgetRecommendations: budgetRecommendations({ registry, lanes, quality })
  };
}

export async function writeSourceNetworkReports(reports) {
  await Promise.all([
    writeJsonAtomic(SOURCE_REGISTRY_PATH, reports.registry),
    writeJsonAtomic(SOURCE_QUALITY_PATH, reports.quality),
    writeJsonAtomic(SOURCE_SUPPLY_PATH, reports.supply),
    writeTextAtomic(`output/${reports.registry.date}-source-network.md`, renderSourceNetworkMarkdown(reports))
  ]);
}

export function renderSourceNetworkMarkdown({ registry, quality, supply }) {
  return `# AI Creator OS Data Source Network - ${registry.date}

## Source Registry

- Sources: ${registry.summary.totalSources}
- L0 Premium: ${registry.summary.l0Premium}
- L1 Public: ${registry.summary.l1Public}
- L2 Community: ${registry.summary.l2Community}
- Direct candidate sources: ${registry.summary.directCandidateSources}
- Manual-review-only sources: ${registry.summary.manualReviewOnlySources}

## Source Health Dashboard

- New candidates tracked: ${quality.summary.totalCandidates}
- Effective candidates: ${quality.summary.effectiveCandidates}
- Rejected candidates: ${quality.summary.rejectedCandidates}
- Duplicate rate: ${quality.summary.duplicateRate}
- Rejection rate: ${quality.summary.rejectionRate}
- Lane coverage: ${quality.summary.laneCoverage}

## Supply Gap Report

- Target accounts: ${supply.summary.targetAccounts}
- Inventory per account: ${supply.summary.inventoryPerAccount}
- Required inventory: ${supply.summary.requiredInventory}
- Current inventory: ${supply.summary.currentInventory}
- Direct candidates: ${supply.summary.directCandidates}
- Review-only candidates: ${supply.summary.reviewOnlyCandidates}
- Projected inventory: ${supply.summary.projectedInventory}
- Current gap: ${supply.summary.inventoryGap}
- Projected gap: ${supply.summary.projectedGap}

## Lanes

${supply.lanes.map((lane) => `- ${lane.name}: current ${lane.currentInventory}/${lane.requiredInventory}, candidates ${lane.directCandidateCount}, gap ${lane.gap}, projected gap ${lane.projectedGap}`).join("\n")}

## Recommendations

${[...quality.recommendations, ...supply.budgetRecommendations].map((item, index) => `${index + 1}. ${item}`).join("\n") || "No source-network recommendations yet."}

## Source Rules

- L0 Premium and L1 Public may enter candidate production after quality checks.
- L2 Community can only enter raw_candidates for manual review.
- Do not generate publish tasks directly from Telegram, Discord, or Reddit noise.
`;
}

function normalizeTier(tier = "") {
  const value = String(tier || "").toUpperCase();
  if (["L0", "L1", "L2"].includes(value)) return value;
  return "L1";
}

function normalizeSourceStatus(status = "") {
  const value = String(status || "").toLowerCase().trim();
  if (["active", "paused", "planned"].includes(value)) return value;
  return "planned";
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function sourceNetworkConfigFromRegistry(registry) {
  if (!registry?.sources?.length) return null;
  return {
    version: 1,
    updatedAt: registry.generatedAt || "",
    target: DEFAULT_SOURCE_NETWORK.target,
    lanes: Array.isArray(registry.lanes) ? registry.lanes : [],
    sources: registry.sources
  };
}

function normalizeEditableSource(input, config) {
  const laneIds = normalizeEditableLaneIds(input.laneIds || input.lanes || input.laneId, config);
  if (!laneIds.length) throw new Error("至少选择一条内容线。");
  const name = String(input.name || "").trim();
  const url = String(input.url || "").trim();
  if (!name) throw new Error("数据源名称不能为空。");
  const sourceId = String(input.sourceId || sourceIdFromName(name, url)).trim();
  if (!sourceId) throw new Error("sourceId is required.");
  const tier = normalizeTier(input.tier);
  const reviewPolicy = String(input.reviewPolicy || (tier === "L2" ? "manual_review_only" : "direct_candidate")).trim();
  return {
    sourceId,
    name,
    tier,
    type: String(input.type || tierType(tier)).trim(),
    laneIds,
    status: normalizeSourceStatus(input.status),
    qualityScore: clampScore(input.qualityScore || (tier === "L0" ? 90 : tier === "L2" ? 45 : 75)),
    freshnessScore: clampScore(input.freshnessScore || 70),
    reviewPolicy: tier === "L2" ? "manual_review_only" : reviewPolicy,
    requiresApiKey: Boolean(input.requiresApiKey || input.requiresCredential),
    url,
    notes: String(input.notes || "").trim()
  };
}

function normalizeEditableLaneIds(value, config) {
  const laneIds = new Set((Array.isArray(value) ? value : String(value || "").split(/[,\s]+/))
    .map((laneId) => String(laneId || "").trim())
    .filter(Boolean));
  const allowed = new Set((config.lanes || []).map((lane) => lane.laneId));
  return [...laneIds].filter((laneId) => allowed.has(laneId));
}

function sourceIdFromName(name, url) {
  const basis = name || hostFromUrl(url) || "source";
  return basis
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function tierType(tier) {
  if (tier === "L0") return "premium";
  if (tier === "L2") return "community";
  return "public";
}

function normalizeSourceCandidateItems(data) {
  return (data.items ?? []).map((item) => ({
    ...item,
    sourceId: item.sourceId || item.source || "",
    laneIds: item.laneIds || [item.circle].filter(Boolean),
    status: item.status || "active"
  }));
}

function candidateSourceKey(item, config = null) {
  const sourceId = String(item.sourceId || item.source || item.feedId || item.connectorId || "").trim();
  return canonicalSourceId(sourceId, config);
}

function candidateLaneIds(item) {
  const rawLaneIds = [
    ...(Array.isArray(item.laneIds) ? item.laneIds : []),
    item.laneId,
    item.circle
  ].filter(Boolean).map(String);
  return [...new Set(rawLaneIds.flatMap((laneId) => canonicalLaneIds(laneId, item)))];
}

function inventoryLaneIds(item, context) {
  const explicit = candidateLaneIds(item);
  if (explicit.length) return explicit;
  const topic = context.topicsById.get(item.topicId) ?? {};
  const tool = context.toolsById.get(item.toolId || topic.toolId) ?? {};
  return inferLaneIdsFromText({
    ...tool,
    ...topic,
    ...item,
    inventoryText: [
      tool.name,
      tool.tagline,
      tool.domain,
      tool.officialUrl,
      topic.audience,
      topic.painPoint,
      topic.useCase,
      item.copyText,
      item.notes
    ].filter(Boolean).join(" ")
  });
}

function isRejectedCandidate(item) {
  return ["rejected", "blocked", "skip"].includes(String(item.status || "").toLowerCase())
    || item.duplicateCheckResult?.riskLevel === "block"
    || (item.riskFlags ?? []).some((flag) => flag.severity === "block");
}

function isValidCandidate(item) {
  return !isRejectedCandidate(item) && Boolean(item.url || item.title || item.name);
}

function isInventoryTask(task) {
  return !["rejected", "posted", "feedback_done", "canceled"].includes(String(task.status || "").toLowerCase());
}

function canDirectlyUseCandidate(item, registry) {
  const source = registry.sources.find((entry) => entry.sourceId === candidateSourceKey(item));
  return !source || source.canDirectlyGenerateTasks;
}

function canonicalSourceId(sourceId, config) {
  if (!sourceId) return "";
  const configuredIds = new Set((config?.sources ?? []).map((source) => source.sourceId));
  if (configuredIds.has(sourceId)) return sourceId;
  if (sourceId.startsWith("hn_")) return configuredIds.has("hacker_news") ? "hacker_news" : sourceId;
  return sourceId;
}

function canonicalLaneIds(laneId, item) {
  if (["ai_builder", "ai_saas", "ai_agent", "crypto_builder", "crypto_alpha"].includes(laneId)) return [laneId];
  if (["indie_hackers", "indie_builders", "saas_founders"].includes(laneId)) return ["ai_saas"];
  if (laneId === "ai_startups") return [aiStartupLane(item)];
  if (laneId === "crypto_builders") return [cryptoLane(item)];
  return [laneId];
}

function aiStartupLane(item) {
  const text = searchableText(item);
  if (/\b(agent|agents|mcp|automation|workflow|tool use|orchestration)\b/i.test(text)) return "ai_agent";
  return "ai_builder";
}

function cryptoLane(item) {
  const text = searchableText(item);
  if (/\b(alpha|narrative|trend|market|new project|launch|token|coin|price|trading|etf)\b/i.test(text)) return "crypto_alpha";
  return "crypto_builder";
}

function searchableText(item) {
  return [
    item.title,
    item.name,
    item.summary,
    item.description,
    item.tagline,
    item.rawText,
    item.inventoryText,
    item.notes,
    item.sourceId,
    item.source
  ].filter(Boolean).join(" ");
}

function inferLaneIdsFromText(item) {
  const text = searchableText(item);
  if (!text) return [];
  if (/\b(crypto|web3|onchain|wallet|defi|stablecoin|token|solana|base|arbitrum|ethereum|bitcoin|etf|coindesk|theblock|decrypt)\b/i.test(text)) return [cryptoLane(item)];
  if (/\b(saas|pricing|growth|churn|onboarding|plg|sales|support|product hunt|producthunt|affiliate|acquisition|founder|solo operator|solo founder)\b/i.test(text)) return ["ai_saas"];
  if (/\b(agent|agents|mcp|automation|workflow|tool use|orchestration)\b/i.test(text)) return ["ai_agent"];
  if (/\b(ai|llm|model|cursor|claude|codex|developer|api|tool|github)\b/i.test(text)) return ["ai_builder"];
  return [];
}

function buildInventoryContext({ tools = [], topics = [] }) {
  return {
    toolsById: new Map(tools.map((tool) => [tool.toolId, tool])),
    topicsById: new Map(topics.map((topic) => [topic.topicId, topic]))
  };
}

function duplicateCount(items) {
  const seen = new Set();
  let duplicates = 0;
  for (const item of items) {
    const key = String(item.url || item.normalizedUrl || item.title || item.name || "").toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "").trim();
    if (!key) continue;
    if (seen.has(key) || item.duplicateCheckResult?.riskLevel === "block") duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function sourceQualityStatus({ source, candidates, valid, rejected, duplicates }) {
  if (source.status !== "active") return source.status;
  if (!candidates.length) return "needs_candidates";
  if (rejected / candidates.length > 0.35 || duplicates / candidates.length > 0.25) return "tune_or_disable";
  if (valid >= 10 && source.qualityScore >= 75) return "healthy";
  return "watch";
}

function sourceQualityRecommendation({ source, candidates, valid, rejected, duplicates }) {
  if (source.tier === "L0" && source.status === "planned") return "Keep as premium budget candidate; connect only after public lanes show repeatable demand.";
  if (source.tier === "L2") return "Manual review only. Never generate publish tasks directly from this source.";
  if (!candidates.length) return "No candidates yet. Test this source before trusting it for daily supply.";
  if (rejected || duplicates) return `Tune filters: ${rejected} rejected and ${duplicates} duplicate candidates.`;
  if (valid < 5) return "Needs more candidate volume before it can support 100 accounts.";
  return "Keep in the source network.";
}

function sourceNetworkRecommendations({ sourceRows, lanes, registry }) {
  const actions = [];
  const shortLane = lanes.find((lane) => lane.status === "short");
  const weakSource = sourceRows.find((source) => source.status === "tune_or_disable");
  const activePremium = registry.sources.filter((source) => source.tier === "L0" && source.status === "active").length;
  if (shortLane) actions.push(`Add supply for ${shortLane.name}; it has ${shortLane.effectiveCandidates} effective candidates against ${shortLane.accountTarget * 10} target inventory.`);
  if (weakSource) actions.push(`Tune or disable ${weakSource.name}; duplicate/rejection rate is too high.`);
  if (!activePremium) actions.push("Keep L0 premium sources planned until L1 public supply proves which lanes deserve budget.");
  return actions;
}

function budgetRecommendations({ registry, lanes, quality }) {
  const actions = [];
  const shortLanes = lanes.filter((lane) => lane.projectedGap > 0).sort((a, b) => b.projectedGap - a.projectedGap);
  for (const lane of shortLanes.slice(0, 3)) {
    const premium = registry.sources.find((source) => source.tier === "L0" && source.laneIds.includes(lane.laneId));
    if (premium) actions.push(`Budget candidate: ${premium.name} can help ${lane.name}, projected gap ${lane.projectedGap}.`);
    else actions.push(`Need more L1 sources for ${lane.name}; projected gap ${lane.projectedGap}.`);
  }
  const noisy = quality.sources.find((source) => source.tier === "L2" && source.effectiveCandidates > 0);
  if (noisy) actions.push(`${noisy.name} has usable community signal, but keep it manual-review-only.`);
  return actions;
}

function groupBy(items, keyFn) {
  return items.reduce((map, item) => {
    const key = keyFn(item);
    if (!key) return map;
    map.set(key, [...(map.get(key) ?? []), item]);
    return map;
  }, new Map());
}

function latestBy(items, valueFn) {
  return [...items].sort((a, b) => String(valueFn(b)).localeCompare(String(valueFn(a))))[0] ?? null;
}

function roundRate(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
