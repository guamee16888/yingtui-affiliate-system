export function normalizeTier(tier = "") {
  const value = String(tier || "").toUpperCase();
  if (["L0", "L1", "L2"].includes(value)) return value;
  return "L1";
}

export function normalizeSourceStatus(status = "") {
  const value = String(status || "").toLowerCase().trim();
  if (["active", "paused", "planned"].includes(value)) return value;
  return "planned";
}

export function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

export function normalizeEditableSource(input, config) {
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

export function normalizeSourceCandidateItems(data) {
  return (data.items ?? []).map((item) => ({
    ...item,
    sourceId: item.sourceId || item.source || "",
    laneIds: item.laneIds || [item.circle].filter(Boolean),
    status: item.status || "active"
  }));
}

export function candidateSourceKey(item, config = null) {
  const sourceId = String(item.sourceId || item.source || item.feedId || item.connectorId || "").trim();
  return canonicalSourceId(sourceId, config);
}

export function candidateLaneIds(item) {
  const rawLaneIds = [
    ...(Array.isArray(item.laneIds) ? item.laneIds : []),
    item.laneId,
    item.circle
  ].filter(Boolean).map(String);
  return [...new Set(rawLaneIds.flatMap((laneId) => canonicalLaneIds(laneId, item)))];
}

export function inventoryLaneIds(item, context) {
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

export function isRejectedCandidate(item) {
  return ["rejected", "blocked", "skip"].includes(String(item.status || "").toLowerCase())
    || item.duplicateCheckResult?.riskLevel === "block"
    || (item.riskFlags ?? []).some((flag) => flag.severity === "block");
}

export function isValidCandidate(item) {
  return !isRejectedCandidate(item) && Boolean(item.url || item.title || item.name);
}

export function isInventoryTask(task) {
  return !["rejected", "posted", "feedback_done", "canceled"].includes(String(task.status || "").toLowerCase());
}

export function canDirectlyUseCandidate(item, registry) {
  const source = registry.sources.find((entry) => entry.sourceId === candidateSourceKey(item));
  return !source || source.canDirectlyGenerateTasks;
}

export function buildInventoryContext({ tools = [], topics = [] }) {
  return {
    toolsById: new Map(tools.map((tool) => [tool.toolId, tool])),
    topicsById: new Map(topics.map((topic) => [topic.topicId, topic]))
  };
}

export function duplicateCount(items) {
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

export function sourceQualityStatus({ source, candidates, valid, rejected, duplicates }) {
  if (source.status !== "active") return source.status;
  if (!candidates.length) return "needs_candidates";
  if (rejected / candidates.length > 0.35 || duplicates / candidates.length > 0.25) return "tune_or_disable";
  if (valid >= 10 && source.qualityScore >= 75) return "healthy";
  return "watch";
}

export function sourceQualityRecommendation({ source, candidates, valid, rejected, duplicates }) {
  if (source.tier === "L0" && source.status === "planned") return "Keep as premium budget candidate; connect only after public lanes show repeatable demand.";
  if (source.tier === "L2") return "Manual review only. Never generate publish tasks directly from this source.";
  if (!candidates.length) return "No candidates yet. Test this source before trusting it for daily supply.";
  if (rejected || duplicates) return `Tune filters: ${rejected} rejected and ${duplicates} duplicate candidates.`;
  if (valid < 5) return "Needs more candidate volume before it can support 100 accounts.";
  return "Keep in the source network.";
}

export function sourceNetworkRecommendations({ sourceRows, lanes, registry }) {
  const actions = [];
  const shortLane = lanes.find((lane) => lane.status === "short");
  const weakSource = sourceRows.find((source) => source.status === "tune_or_disable");
  const activePremium = registry.sources.filter((source) => source.tier === "L0" && source.status === "active").length;
  if (shortLane) actions.push(`Add supply for ${shortLane.name}; it has ${shortLane.effectiveCandidates} effective candidates against ${shortLane.accountTarget * 10} target inventory.`);
  if (weakSource) actions.push(`Tune or disable ${weakSource.name}; duplicate/rejection rate is too high.`);
  if (!activePremium) actions.push("Keep L0 premium sources planned until L1 public supply proves which lanes deserve budget.");
  return actions;
}

export function budgetRecommendations({ registry, lanes, quality }) {
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

export function groupBy(items, keyFn) {
  return items.reduce((map, item) => {
    const key = keyFn(item);
    if (!key) return map;
    map.set(key, [...(map.get(key) ?? []), item]);
    return map;
  }, new Map());
}

export function latestBy(items, valueFn) {
  return [...items].sort((a, b) => String(valueFn(b)).localeCompare(String(valueFn(a))))[0] ?? null;
}

export function roundRate(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
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
