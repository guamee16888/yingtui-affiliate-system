import { readJson, writeJsonAtomic, writeTextAtomic } from "../file-store.mjs";
import { emptyCollection, normalizeCollection, CORE_COLLECTIONS } from "../core-data.mjs";
import { SOURCE_CANDIDATES_PATH, DEFAULT_SOURCE_CANDIDATES } from "../content-source-system.mjs";
import { SOURCE_LANE_FILES } from "../source-lanes.mjs";
import { DEFAULT_SOURCE_NETWORK, loadSourceNetworkConfig, normalizeSourceNetworkConfig } from "./config.mjs";
import {
  budgetRecommendations,
  buildInventoryContext,
  canDirectlyUseCandidate,
  candidateLaneIds,
  candidateSourceKey,
  duplicateCount,
  groupBy,
  inventoryLaneIds,
  isInventoryTask,
  isRejectedCandidate,
  isValidCandidate,
  latestBy,
  normalizeSourceCandidateItems,
  roundRate,
  sourceNetworkRecommendations,
  sourceQualityRecommendation,
  sourceQualityStatus,
  todayDate
} from "./internal.mjs";
import { renderSourceNetworkMarkdown } from "./render.mjs";

export const SOURCE_REGISTRY_PATH = "data/source-registry.json";
export const SOURCE_QUALITY_PATH = "data/source-quality.json";
export const SOURCE_SUPPLY_PATH = "data/source-supply.json";

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
