import { emptyCollection, normalizeCollection, withUpdatedAt } from "./core-data.mjs";
import { createStableId, slugify } from "./ids.mjs";
import { checkCandidateDuplicate, createCandidateId } from "./candidate-dedupe.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";
import { classifyCandidate, classifyRiskFlags, CONTENT_LANE_IDS } from "./source-classifier.mjs";
import { normalizeDomain, normalizeUrl } from "./url-utils.mjs";

export const SOURCE_LANE_FILES = {
  workspaces: "data/workspaces.json",
  contentLanes: "data/content-lanes.json",
  sourceConnectors: "data/source-connectors.json",
  sourceFeeds: "data/source-feeds.json",
  rawCandidates: "data/raw-candidates.json",
  sourceRuns: "data/source-runs.json",
  workspaceLanes: "data/workspace-lanes.json",
  manualCandidates: "data/manual-candidates.json"
};

export const DEFAULT_CONTENT_LANES = [
  {
    laneId: "ai_startups",
    name: "AI 创业圈",
    description: "AI product, agents, workflows, automation, model apps, AI founder insights, and AI tools.",
    allowedTopics: ["AI product", "agents", "workflows", "automation", "model apps", "AI founder insights", "AI tools"],
    blockedTopics: ["income promise", "guaranteed growth", "fake affiliate link"],
    defaultStyle: "practical, curious, no hype, founder/operator friendly",
    defaultLinkPolicy: "mostly_no_link",
    riskPolicy: "conservative",
    active: true
  },
  {
    laneId: "indie_builders",
    name: "独立开发者圈",
    description: "Solo founder, indie hacking, build in public, small tools, launch lessons, revenue notes, and developer workflows.",
    allowedTopics: ["solo founder", "indie hacking", "build in public", "small tools", "launch lessons", "revenue notes", "developer workflows"],
    blockedTopics: ["fake MRR", "guaranteed income", "spam launch"],
    defaultStyle: "personal, direct, builder notes, low hype",
    defaultLinkPolicy: "mostly_no_link",
    riskPolicy: "conservative",
    active: true
  },
  {
    laneId: "saas_founders",
    name: "SaaS 创始人圈",
    description: "Pricing, onboarding, churn, PLG, sales, support, founder operations, positioning, and B2B growth.",
    allowedTopics: ["pricing", "onboarding", "churn", "PLG", "sales", "support", "founder operations", "positioning", "B2B growth"],
    blockedTopics: ["generic startup motivation", "fake case study", "unverified revenue claim"],
    defaultStyle: "practical, operator-first, useful to founders, no fake authority",
    defaultLinkPolicy: "mostly_no_link",
    riskPolicy: "conservative",
    active: true
  },
  {
    laneId: "crypto_builders",
    name: "Crypto builder 圈",
    description: "Onchain data tools, wallet UX, security tools, infra, dev tooling, dashboards, community operations, and builder lessons.",
    allowedTopics: ["onchain data tools", "wallet UX", "security tools", "infra", "dev tooling", "dashboards", "community operations", "builder lessons"],
    blockedTopics: ["price prediction", "pump", "signal", "financial advice", "guaranteed returns", "leverage", "gambling"],
    defaultStyle: "builder-focused, risk-aware, no investment advice",
    defaultLinkPolicy: "mostly_no_link",
    riskPolicy: "strict",
    active: true
  }
];

export const DEFAULT_WORKSPACES = [
  {
    workspaceId: "workspace_default",
    name: "Default Workspace",
    plan: "internal",
    accountLimit: 30,
    managerUserIds: ["user_owner"],
    staffUserIds: ["user_owner"],
    enabledLaneIds: [...CONTENT_LANE_IDS],
    publishMode: "manual",
    autoPublishEnabled: false,
    requiresFinalApproval: true,
    active: true,
    createdAt: "",
    updatedAt: ""
  }
];

export const DEFAULT_SOURCE_CONNECTORS = [
  {
    connectorId: "manual",
    name: "Manual Candidate Intake",
    type: "manual",
    status: "active",
    laneIds: [...CONTENT_LANE_IDS],
    qualityTier: "A",
    requiresApiKey: false,
    notes: "Human-curated candidates pasted into data/manual-candidates.json."
  },
  {
    connectorId: "product_hunt",
    name: "Product Hunt",
    type: "api",
    status: "active",
    laneIds: ["ai_startups", "indie_builders", "saas_founders"],
    qualityTier: "A",
    requiresApiKey: true,
    notes: "Platform-level connector. Workspaces subscribe to lanes, not this API directly."
  },
  {
    connectorId: "hacker_news",
    name: "Hacker News",
    type: "api",
    status: "paused",
    laneIds: ["indie_builders", "saas_founders", "ai_startups"],
    qualityTier: "B",
    requiresApiKey: false,
    notes: "Future public API connector for Show HN and founder/operator discussions."
  },
  {
    connectorId: "github",
    name: "GitHub REST",
    type: "api",
    status: "paused",
    laneIds: ["ai_startups", "indie_builders", "crypto_builders"],
    qualityTier: "B",
    requiresApiKey: false,
    notes: "Future developer tooling and repo trend connector."
  },
  {
    connectorId: "paid_search",
    name: "Paid AI Search",
    type: "paid_api",
    status: "paused",
    laneIds: [...CONTENT_LANE_IDS],
    qualityTier: "A",
    requiresApiKey: true,
    notes: "Placeholder for Exa/Tavily-style search. Not connected in v1."
  }
];

export const DEFAULT_SOURCE_FEEDS = [
  {
    feedId: "feed_ai_manual",
    connectorId: "manual",
    laneId: "ai_startups",
    name: "AI Startup Manual Intake",
    url: "",
    status: "active",
    qualityScore: 85,
    notes: "Manual AI tool, agent, workflow, automation, and founder signal candidates."
  },
  {
    feedId: "feed_indie_manual",
    connectorId: "manual",
    laneId: "indie_builders",
    name: "Indie Builder Manual Intake",
    url: "",
    status: "active",
    qualityScore: 82,
    notes: "Manual solo founder, launch, build in public, revenue, and workflow candidates."
  },
  {
    feedId: "feed_saas_manual",
    connectorId: "manual",
    laneId: "saas_founders",
    name: "SaaS Founder Manual Intake",
    url: "",
    status: "active",
    qualityScore: 88,
    notes: "Manual pricing, onboarding, churn, PLG, sales, and founder ops candidates."
  },
  {
    feedId: "feed_crypto_manual",
    connectorId: "manual",
    laneId: "crypto_builders",
    name: "Crypto Builder Manual Intake",
    url: "",
    status: "active",
    qualityScore: 78,
    notes: "Manual wallet UX, security, infra, onchain data, and dev tooling candidates."
  }
];

export const DEFAULT_WORKSPACE_LANES = CONTENT_LANE_IDS.map((laneId, index) => ({
  workspaceId: "workspace_default",
  laneId,
  enabled: true,
  priority: index + 1,
  monthlyQuota: 300,
  notes: "Default internal subscription created by Source Lane v1 seed."
}));

export const DEFAULT_MANUAL_CANDIDATES = [
  {
    title: "Agent workflow builder for support teams",
    url: "https://www.producthunt.com/search?q=agent%20workflow%20builder",
    summary: "AI agent workflow automation for support ops teams that need fewer manual triage steps.",
    rawText: "agent workflow automation support team AI product",
    laneHints: ["ai_startups"],
    sourcePublishedAt: "",
    sourceId: "manual_seed",
    connectorId: "manual",
    feedId: "feed_ai_manual"
  },
  {
    title: "Solo founder launch checklist",
    url: "https://news.ycombinator.com/show",
    summary: "A build in public launch workflow for indie builders shipping small tools.",
    rawText: "solo founder launch build in public revenue workflow",
    laneHints: ["indie_builders"],
    sourcePublishedAt: "",
    sourceId: "manual_seed",
    connectorId: "manual",
    feedId: "feed_indie_manual"
  },
  {
    title: "SaaS onboarding churn teardown",
    url: "https://www.lennysnewsletter.com/",
    summary: "Pricing, onboarding, churn and PLG notes for B2B SaaS founders.",
    rawText: "pricing onboarding churn PLG sales founder ops",
    laneHints: ["saas_founders"],
    sourcePublishedAt: "",
    sourceId: "manual_seed",
    connectorId: "manual",
    feedId: "feed_saas_manual"
  },
  {
    title: "Wallet security dashboard for builders",
    url: "https://github.com/topics/wallet-security",
    summary: "A crypto builder dashboard for wallet UX, security, onchain data and infra teams.",
    rawText: "wallet UX security onchain data dev tooling crypto builder",
    laneHints: ["crypto_builders"],
    sourcePublishedAt: "",
    sourceId: "manual_seed",
    connectorId: "manual",
    feedId: "feed_crypto_manual"
  }
];

export async function seedSourceLanes() {
  const data = await loadSourceLaneData();
  const result = buildSourceLaneSeed(data);
  await saveSourceLaneData(result.next);
  return result.stats;
}

export async function loadSourceLaneData() {
  const [
    workspaces,
    contentLanes,
    sourceConnectors,
    sourceFeeds,
    rawCandidates,
    sourceRuns,
    workspaceLanes,
    manualCandidates
  ] = await Promise.all([
    readCollection(SOURCE_LANE_FILES.workspaces),
    readCollection(SOURCE_LANE_FILES.contentLanes),
    readCollection(SOURCE_LANE_FILES.sourceConnectors),
    readCollection(SOURCE_LANE_FILES.sourceFeeds),
    readCollection(SOURCE_LANE_FILES.rawCandidates),
    readCollection(SOURCE_LANE_FILES.sourceRuns),
    readCollection(SOURCE_LANE_FILES.workspaceLanes),
    readCollection(SOURCE_LANE_FILES.manualCandidates)
  ]);

  return {
    workspaces,
    contentLanes,
    sourceConnectors,
    sourceFeeds,
    rawCandidates,
    sourceRuns,
    workspaceLanes,
    manualCandidates
  };
}

export async function saveSourceLaneData(data) {
  await Promise.all([
    writeCollection(SOURCE_LANE_FILES.workspaces, data.workspaces),
    writeCollection(SOURCE_LANE_FILES.contentLanes, data.contentLanes),
    writeCollection(SOURCE_LANE_FILES.sourceConnectors, data.sourceConnectors),
    writeCollection(SOURCE_LANE_FILES.sourceFeeds, data.sourceFeeds),
    writeCollection(SOURCE_LANE_FILES.rawCandidates, data.rawCandidates),
    writeCollection(SOURCE_LANE_FILES.sourceRuns, data.sourceRuns),
    writeCollection(SOURCE_LANE_FILES.workspaceLanes, data.workspaceLanes),
    writeCollection(SOURCE_LANE_FILES.manualCandidates, data.manualCandidates)
  ]);
}

export function buildSourceLaneSeed(data) {
  const now = new Date().toISOString();
  const currentRawCandidates = normalizeCollection(data.rawCandidates ?? emptyCollection());
  const rawCandidates = withUpdatedAt({
    ...currentRawCandidates,
    items: currentRawCandidates.items.filter((item) => !isPlaceholderManualSeed(item))
  });
  const next = {
    workspaces: seedItems(data.workspaces, DEFAULT_WORKSPACES.map((item) => timed(item, now)), "workspaceId"),
    contentLanes: seedItems(data.contentLanes, DEFAULT_CONTENT_LANES.map((item) => timed(item, now)), "laneId"),
    sourceConnectors: seedItems(data.sourceConnectors, DEFAULT_SOURCE_CONNECTORS.map((item) => timed(item, now)), "connectorId"),
    sourceFeeds: seedItems(data.sourceFeeds, DEFAULT_SOURCE_FEEDS.map((item) => timed(item, now)), "feedId"),
    rawCandidates,
    sourceRuns: normalizeCollection(data.sourceRuns ?? emptyCollection()),
    workspaceLanes: seedItems(data.workspaceLanes, DEFAULT_WORKSPACE_LANES.map((item) => timed(item, now)), workspaceLaneKey),
    manualCandidates: seedItems(data.manualCandidates, DEFAULT_MANUAL_CANDIDATES.map((item) => timed(item, now)), manualCandidateKey)
  };

  return {
    next,
    stats: {
      lanes: next.contentLanes.items.length,
      workspaces: next.workspaces.items.length,
      connectors: next.sourceConnectors.items.length,
      feeds: next.sourceFeeds.items.length,
      workspaceLanes: next.workspaceLanes.items.length,
      manualCandidates: next.manualCandidates.items.length,
      removedPlaceholderRawCandidates: currentRawCandidates.items.length - rawCandidates.items.length
    }
  };
}

export async function ingestManualCandidates() {
  const data = await loadSourceLaneData();
  const result = buildManualCandidateIngest(data);
  await saveSourceLaneData({
    ...data,
    rawCandidates: result.rawCandidates,
    sourceRuns: result.sourceRuns
  });
  return result.stats;
}

export function buildManualCandidateIngest(data) {
  const existing = normalizeCollection(data.rawCandidates ?? emptyCollection());
  const sourceRuns = normalizeCollection(data.sourceRuns ?? emptyCollection());
  const contentLanes = normalizeCollection(data.contentLanes ?? emptyCollection()).items;
  const now = new Date().toISOString();
  const seenThisRun = new Set();
  const imported = [];
  const skipped = [];
  const warnings = [];

  for (const input of normalizeCollection(data.manualCandidates ?? emptyCollection()).items) {
    if (isPlaceholderInput(input)) {
      skipped.push({ title: input.title || "", url: input.url || "", reason: "placeholder_or_empty" });
      continue;
    }
    const duplicate = checkCandidateDuplicate(input, [...existing.items, ...imported]);
    const keys = rawCandidateKeys(input);
    const duplicatedThisRun = keys.some((key) => seenThisRun.has(key));
    if (!duplicate.ok || duplicatedThisRun) {
      skipped.push({
        title: input.title || "",
        url: input.url || "",
        reason: duplicatedThisRun ? "duplicate_in_run" : duplicate.flags.find((flag) => flag.severity === "block")?.type || "duplicate"
      });
      continue;
    }
    for (const flag of duplicate.flags) warnings.push({ title: input.title || "", url: input.url || "", ...flag });
    for (const key of keys) seenThisRun.add(key);
    const candidate = buildRawCandidate(input, {
      now,
      contentLanes,
      duplicateCheckResult: duplicate
    });
    imported.push(candidate);
  }

  const rawCandidates = withUpdatedAt({
    ...existing,
    items: [...existing.items, ...imported]
  });
  const run = {
    runId: createStableId("sourcerun", ["manual", now, imported.length, skipped.length]),
    connectorId: "manual",
    startedAt: now,
    finishedAt: now,
    status: skipped.length && imported.length ? "partial" : "success",
    createdCandidates: imported.length,
    skippedDuplicates: skipped.filter((item) => String(item.reason).includes("duplicate")).length,
    errors: [],
    warnings,
    notes: "Manual candidates ingested into raw-candidates. No tasks or publish jobs were created.",
    createdAt: now,
    updatedAt: now
  };

  return {
    rawCandidates,
    sourceRuns: withUpdatedAt({ ...sourceRuns, items: [...sourceRuns.items, run] }),
    imported,
    skipped,
    warnings,
    stats: {
      manualCandidates: normalizeCollection(data.manualCandidates ?? emptyCollection()).items.length,
      imported: imported.length,
      skippedDuplicates: skipped.length,
      warnings: warnings.length,
      sourceRunId: run.runId,
      totalRawCandidates: rawCandidates.items.length,
      withoutLane: rawCandidates.items.filter((item) => !item.laneIds?.length).length,
      cryptoRiskFlags: rawCandidates.items.filter((item) => (item.riskFlags ?? []).some((flag) => flag.type === "crypto_blocked_topic")).length
    }
  };
}

export function buildRawCandidate(input, { now = new Date().toISOString(), contentLanes = [], duplicateCheckResult = null } = {}) {
  const classification = classifyCandidate(input, contentLanes);
  const laneIds = normalizeLaneIds(input.laneIds?.length ? input.laneIds : classification.laneIds);
  const riskFlags = candidateRiskFlags(input, laneIds);
  const url = String(input.url || "").trim();
  const title = String(input.title || input.name || "").trim();
  const candidateId = createCandidateId({ ...input, title, url });
  const sourceQualityScore = Number(input.sourceQualityScore ?? defaultSourceQualityScore(input.connectorId));
  const candidateScore = Math.max(0, sourceQualityScore - riskFlags.filter((flag) => flag.severity === "block").length * 40);
  const feedId = input.feedId || defaultFeedId(laneIds[0]);

  return {
    candidateId,
    sourceId: input.sourceId || input.feedId || "",
    connectorId: input.connectorId || "manual",
    feedId,
    laneIds,
    title,
    url,
    domain: normalizeDomain(url),
    summary: input.summary || input.tagline || "",
    rawText: input.rawText || "",
    sourcePublishedAt: input.sourcePublishedAt || input.published || "",
    sourceQualityScore,
    candidateScore,
    status: riskFlags.some((flag) => flag.severity === "block") ? "rejected" : "new",
    duplicateCheckResult: duplicateCheckResult ?? {
      ok: true,
      riskLevel: "low",
      flags: []
    },
    riskFlags,
    classification: {
      confidence: classification.confidence,
      reason: classification.reason
    },
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function classifyCandidateLanes(candidate) {
  return classifyCandidate(candidate).laneIds;
}

export function candidateRiskFlags(candidate, laneIds = classifyCandidateLanes(candidate)) {
  return classifyRiskFlags(candidate, laneIds);
}

export async function loadLaneSummary() {
  return buildLaneSummary(await loadSourceLaneData());
}

export function buildLaneSummary(data) {
  const contentLanes = normalizeCollection(data.contentLanes ?? emptyCollection()).items;
  const sourceFeeds = normalizeCollection(data.sourceFeeds ?? emptyCollection()).items;
  const rawCandidates = normalizeCollection(data.rawCandidates ?? emptyCollection()).items;
  const workspaces = normalizeCollection(data.workspaces ?? emptyCollection()).items;
  const sourceConnectors = normalizeCollection(data.sourceConnectors ?? emptyCollection()).items;
  const workspaceLanes = normalizeCollection(data.workspaceLanes ?? emptyCollection()).items;

  const laneStats = contentLanes.map((lane) => ({
    laneId: lane.laneId,
    name: lane.name,
    active: lane.active !== false,
    sourceFeeds: sourceFeeds.filter((feed) => feed.laneId === lane.laneId).length,
    rawCandidates: rawCandidates.filter((candidate) => (candidate.laneIds ?? []).includes(lane.laneId)).length,
    connectors: sourceConnectors.filter((connector) => (connector.laneIds ?? []).includes(lane.laneId)).length,
    subscribedWorkspaces: workspaces.filter((workspace) => workspaceLaneIds(workspace, workspaceLanes).includes(lane.laneId)).length
  }));
  const workspaceStats = workspaces.map((workspace) => {
    const enabled = workspaceLaneIds(workspace, workspaceLanes);
    return {
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      plan: workspace.plan,
      accountLimit: workspace.accountLimit,
      enabledLaneIds: enabled,
      enabledLaneCount: enabled.length
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      contentLanes: contentLanes.length,
      sourceFeeds: sourceFeeds.length,
      rawCandidates: rawCandidates.length,
      workspaces: workspaces.length,
      sourceConnectors: sourceConnectors.length,
      workspaceLanes: workspaceLanes.length,
      workspacesWithoutLanes: workspaceStats.filter((workspace) => !workspace.enabledLaneIds.length).length,
      lanesWithoutWorkspace: laneStats.filter((lane) => lane.subscribedWorkspaces === 0).length,
      inactiveLanes: laneStats.filter((lane) => !lane.active).length,
      connectorsWithoutLane: sourceConnectors.filter((connector) => !connector.laneIds?.length).length,
      candidatesWithoutLane: rawCandidates.filter((candidate) => !candidate.laneIds?.length).length
    },
    laneStats,
    workspaceStats,
    lanesWithoutWorkspace: laneStats.filter((lane) => lane.subscribedWorkspaces === 0).map((lane) => lane.laneId),
    inactiveLanes: laneStats.filter((lane) => !lane.active).map((lane) => lane.laneId),
    connectorsWithoutLane: sourceConnectors.filter((connector) => !connector.laneIds?.length).map((connector) => connector.connectorId),
    candidatesWithoutLane: rawCandidates.filter((candidate) => !candidate.laneIds?.length).map((candidate) => candidate.candidateId)
  };
}

export function formatLaneSummary(summary) {
  const lines = [
    "Source Lane Summary",
    `- Content lanes: ${summary.summary.contentLanes}`,
    `- Source feeds: ${summary.summary.sourceFeeds}`,
    `- Raw candidates: ${summary.summary.rawCandidates}`,
    `- Workspaces: ${summary.summary.workspaces}`,
    `- Lanes without workspace: ${summary.summary.lanesWithoutWorkspace}`,
    `- Workspaces without lanes: ${summary.summary.workspacesWithoutLanes}`,
    `- Connectors without lane: ${summary.summary.connectorsWithoutLane}`,
    `- Candidates without lane: ${summary.summary.candidatesWithoutLane}`,
    "",
    "Lanes:"
  ];
  for (const lane of summary.laneStats) {
    lines.push(`- ${lane.laneId}: ${lane.sourceFeeds} feeds, ${lane.rawCandidates} candidates, ${lane.connectors} connectors, ${lane.subscribedWorkspaces} workspaces`);
  }
  lines.push("", "Workspaces:");
  for (const workspace of summary.workspaceStats) {
    lines.push(`- ${workspace.workspaceId}: ${workspace.enabledLaneIds.join(", ") || "no lanes"}`);
  }
  return lines.join("\n");
}

export async function loadCandidateSummary() {
  return buildCandidateSummary(await loadSourceLaneData());
}

export function buildCandidateSummary(data) {
  const rawCandidates = normalizeCollection(data.rawCandidates ?? emptyCollection()).items;
  const sourceRuns = normalizeCollection(data.sourceRuns ?? emptyCollection()).items;
  const laneCounts = Object.fromEntries(CONTENT_LANE_IDS.map((laneId) => [
    laneId,
    rawCandidates.filter((candidate) => (candidate.laneIds ?? []).includes(laneId)).length
  ]));
  const statusCounts = countBy(rawCandidates, "status");
  const duplicateCandidates = rawCandidates.filter((candidate) => ["block", "high"].includes(candidate.duplicateCheckResult?.riskLevel)
    || (candidate.duplicateCheckResult?.flags ?? []).some((flag) => String(flag.type || "").includes("duplicate")));
  const highRiskCandidates = rawCandidates.filter((candidate) => (candidate.riskFlags ?? []).some((flag) => flag.severity === "block")
    || candidate.duplicateCheckResult?.riskLevel === "block");
  const latestSourceRun = [...sourceRuns].sort((a, b) => String(b.finishedAt || b.createdAt).localeCompare(String(a.finishedAt || a.createdAt)))[0] ?? null;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      totalRawCandidates: rawCandidates.length,
      duplicateCandidates: duplicateCandidates.length,
      highRiskCandidates: highRiskCandidates.length,
      candidatesWithoutLane: rawCandidates.filter((candidate) => !candidate.laneIds?.length).length,
      candidatesWithoutUrl: rawCandidates.filter((candidate) => !candidate.url).length,
      latestSourceRunId: latestSourceRun?.runId || ""
    },
    laneCounts,
    statusCounts,
    latestSourceRun,
    duplicateCandidates: duplicateCandidates.map(candidateMiniView),
    highRiskCandidates: highRiskCandidates.map(candidateMiniView),
    candidatesWithoutLane: rawCandidates.filter((candidate) => !candidate.laneIds?.length).map(candidateMiniView),
    candidatesWithoutUrl: rawCandidates.filter((candidate) => !candidate.url).map(candidateMiniView)
  };
}

export function formatCandidateSummary(summary) {
  const lines = [
    "Candidate Summary",
    `- Raw candidates: ${summary.summary.totalRawCandidates}`,
    `- Duplicates/high duplicate risk: ${summary.summary.duplicateCandidates}`,
    `- High risk: ${summary.summary.highRiskCandidates}`,
    `- Without lane: ${summary.summary.candidatesWithoutLane}`,
    `- Without URL: ${summary.summary.candidatesWithoutUrl}`,
    `- Latest source run: ${summary.summary.latestSourceRunId || "none"}`,
    "",
    "Lane counts:"
  ];
  for (const [laneId, count] of Object.entries(summary.laneCounts)) {
    lines.push(`- ${laneId}: ${count}`);
  }
  lines.push("", "Status counts:");
  for (const [status, count] of Object.entries(summary.statusCounts)) {
    lines.push(`- ${status}: ${count}`);
  }
  return lines.join("\n");
}

function countBy(items, field) {
  return items.reduce((acc, item) => {
    const key = item[field] || "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function candidateMiniView(candidate) {
  return {
    candidateId: candidate.candidateId,
    title: candidate.title || "",
    url: candidate.url || "",
    laneIds: candidate.laneIds ?? [],
    status: candidate.status || "new",
    duplicateRiskLevel: candidate.duplicateCheckResult?.riskLevel || "low",
    riskFlags: candidate.riskFlags ?? []
  };
}

async function readCollection(filePath) {
  return normalizeCollection(await readJson(filePath, emptyCollection()));
}

async function writeCollection(filePath, collection) {
  await writeJsonAtomic(filePath, withUpdatedAt(normalizeCollection(collection)));
}

function seedItems(collection, defaults, idFieldOrFn) {
  const next = normalizeCollection(collection ?? emptyCollection());
  const keyOf = typeof idFieldOrFn === "function" ? idFieldOrFn : (item) => item[idFieldOrFn];
  const byKey = new Map(next.items.map((item) => [keyOf(item), item]));
  for (const item of defaults) {
    const key = keyOf(item);
    if (!byKey.has(key)) {
      next.items.push(item);
      byKey.set(key, item);
    }
  }
  return withUpdatedAt(next);
}

function timed(item, now) {
  return {
    ...item,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now
  };
}

function workspaceLaneKey(item) {
  return `${item.workspaceId}::${item.laneId}`;
}

function manualCandidateKey(item) {
  return normalizeUrl(item.url) || slugify(item.title || item.name || "");
}

function rawCandidateKeys(candidate) {
  const keys = [];
  const url = normalizeUrl(candidate.url);
  const title = normalizeTitle(candidate.title);
  if (url) keys.push(`url:${url}`);
  if (title) keys.push(`title:${title}`);
  return keys;
}

function normalizeTitle(title) {
  return String(title ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeLaneIds(laneIds) {
  return [...new Set((laneIds ?? []).filter((laneId) => CONTENT_LANE_IDS.includes(laneId)))];
}

function defaultSourceQualityScore(connectorId) {
  return connectorId === "manual" || !connectorId ? 80 : 70;
}

function defaultFeedId(laneId) {
  if (laneId === "ai_startups") return "feed_ai_manual";
  if (laneId === "indie_builders") return "feed_indie_manual";
  if (laneId === "saas_founders") return "feed_saas_manual";
  if (laneId === "crypto_builders") return "feed_crypto_manual";
  return "";
}

function isPlaceholderInput(input) {
  const title = String(input.title || input.name || "").trim();
  const url = String(input.url || "").trim();
  return !title || !url || normalizeDomain(url) === "example.com";
}

function isPlaceholderManualSeed(item) {
  return normalizeDomain(item.url) === "example.com" && String(item.sourceId || "").includes("manual_seed");
}

export function workspaceLaneIds(workspace, workspaceLanes) {
  const explicit = workspaceLanes
    .filter((item) => item.workspaceId === workspace.workspaceId && item.enabled !== false)
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999))
    .map((item) => item.laneId);
  if (explicit.length) return [...new Set(explicit)];
  return normalizeLaneIds(workspace.enabledLaneIds ?? []);
}
