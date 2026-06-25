import { createToolId } from "../ids.mjs";
import { DEFAULT_CONTENT_SOURCE_CONFIG, DEFAULT_SOURCE_CANDIDATES, normalizeContentSourceConfig } from "./config.mjs";
import { daysSince, evaluateSourceCandidateQuality } from "./quality.mjs";
import { roundRate } from "./helpers.mjs";

export function buildSourceHealth({ date, sourceCandidates = DEFAULT_SOURCE_CANDIDATES, scored = [], contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG, sourceQualityQueue = null }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const scoreByToolId = new Map(scored.map((item) => [item.toolId || createToolId(item.tool?.name, item.tool?.url), item]));
  const candidateItems = sourceCandidates.items ?? [];
  const sourceReports = config.sources.map((source) => sourceHealthForSource({
    date,
    source,
    candidates: candidateItems.filter((item) => item.source === source.id),
    scoreByToolId,
    minimumQualityScore: Number(config.dailyTargets?.minimumQualityScore ?? 18)
  }));
  const orphanSources = [...new Set(candidateItems.map((item) => item.source).filter(Boolean))]
    .filter((sourceId) => !config.sources.some((source) => source.id === sourceId))
    .map((sourceId) => sourceHealthForSource({
      date,
      source: {
        id: sourceId,
        name: sourceId,
        circle: candidateItems.find((item) => item.source === sourceId)?.circle ?? "",
        enabled: true,
        type: "unknown",
        candidateType: "topic",
        includeKeywords: [],
        excludeKeywords: []
      },
      candidates: candidateItems.filter((item) => item.source === sourceId),
      scoreByToolId,
      minimumQualityScore: Number(config.dailyTargets?.minimumQualityScore ?? 18)
    }));
  const sources = [...sourceReports, ...orphanSources].sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name));
  const circles = config.circles.map((circle) => circleHealthForCircle(circle, sources, sourceQualityQueue));

  return {
    date,
    generatedAt: new Date().toISOString(),
    minimumQualityScore: Number(config.dailyTargets?.minimumQualityScore ?? 18),
    summary: {
      configuredSources: config.sources.length,
      enabledSources: config.sources.filter((source) => source.enabled).length,
      trackedSources: sources.length,
      healthySources: sources.filter((source) => source.status === "healthy").length,
      tuneSources: sources.filter((source) => source.status === "tune").length,
      disableCandidates: sources.filter((source) => source.status === "disable_candidate").length,
      totalCandidates: sources.reduce((sum, source) => sum + source.totalCandidates, 0),
      qualifiedCandidates: sources.reduce((sum, source) => sum + source.qualifiedCandidates, 0),
      noiseCandidates: sources.reduce((sum, source) => sum + source.noiseCandidates, 0)
    },
    sources,
    circles,
    recommendations: sourceHealthRecommendations(sources, circles)
  };
}

function sourceHealthForSource({ date, source, candidates, scoreByToolId, minimumQualityScore }) {
  const activeCandidates = candidates.filter((item) => item.status === "active");
  const candidateQuality = activeCandidates.map((item) => ({
    item,
    quality: evaluateSourceCandidateQuality(item, source)
  }));
  const scoredCandidates = activeCandidates
    .map((item) => scoreByToolId.get(item.toolId || createToolId(item.name, item.url)))
    .filter(Boolean);
  const qualifiedCandidates = scoredCandidates.filter((item) => item.followUpAction !== "skip" && Number(item.score) >= minimumQualityScore).length;
  const skippedCandidates = scoredCandidates.filter((item) => item.followUpAction === "skip" || Number(item.score) < minimumQualityScore).length;
  const freshCandidates = activeCandidates.filter((item) => daysSince(item.published, date) !== null && daysSince(item.published, date) <= 2).length;
  const noiseCandidates = candidateQuality.filter((entry) => entry.quality.isNoisy).length;
  const totalCandidates = activeCandidates.length;
  const qualityRate = totalCandidates ? qualifiedCandidates / totalCandidates : 0;
  const freshRate = totalCandidates ? freshCandidates / totalCandidates : 0;
  const noiseRate = totalCandidates ? noiseCandidates / totalCandidates : 0;
  const filterConfigured = (source.includeKeywords?.length ? 1 : 0) + (source.excludeKeywords?.length ? 1 : 0);
  const base = source.enabled ? 20 : 5;
  const healthScore = Math.max(0, Math.min(100, Math.round(
    base
    + Math.min(20, totalCandidates * 2)
    + qualityRate * 35
    + freshRate * 20
    + filterConfigured * 8
    - noiseRate * 35
  )));
  const status = sourceHealthStatus({ source, totalCandidates, healthScore, noiseRate, qualityRate });

  return {
    sourceId: source.id,
    name: source.name,
    circle: source.circle,
    type: source.type,
    candidateType: source.candidateType,
    enabled: source.enabled,
    totalCandidates,
    activeCandidates: totalCandidates,
    qualifiedCandidates,
    skippedCandidates,
    freshCandidates,
    noiseCandidates,
    qualityRate: roundRate(qualityRate),
    freshRate: roundRate(freshRate),
    noiseRate: roundRate(noiseRate),
    healthScore,
    status,
    recommendation: sourceRecommendation({ status, totalCandidates, qualifiedCandidates, noiseCandidates, qualityRate, noiseRate }),
    sampleNoise: candidateQuality.filter((entry) => entry.quality.isNoisy).slice(0, 3).map((entry) => entry.item.name),
    sampleNoiseDetails: candidateQuality.filter((entry) => entry.quality.isNoisy).slice(0, 3).map((entry) => ({
      name: entry.item.name,
      reason: entry.quality.reason,
      blockedTerms: entry.quality.blockedTerms,
      matchedTerms: entry.quality.matchedTerms
    }))
  };
}

function circleHealthForCircle(circle, sources, sourceQualityQueue) {
  const sourceItems = sources.filter((source) => source.circle === circle.id);
  const queueItem = (sourceQualityQueue?.items ?? []).find((item) => item.circleId === circle.id);
  const totalCandidates = sourceItems.reduce((sum, source) => sum + source.totalCandidates, 0);
  const qualifiedCandidates = sourceItems.reduce((sum, source) => sum + source.qualifiedCandidates, 0);
  const enabledSources = sourceItems.filter((source) => source.enabled).length;
  const healthySources = sourceItems.filter((source) => source.status === "healthy").length;
  const sourceGap = Math.max(0, 3 - enabledSources);
  const candidateGap = Number(queueItem?.neededCandidates ?? 0);

  return {
    circleId: circle.id,
    name: circle.name,
    sources: sourceItems.length,
    enabledSources,
    healthySources,
    totalCandidates,
    qualifiedCandidates,
    sourceGap,
    candidateGap,
    status: enabledSources >= 3 && qualifiedCandidates >= 20 ? "covered" : "short",
    recommendation: sourceGap > 0
      ? `Add or test ${sourceGap} more reliable ${circle.name} sources.`
      : candidateGap > 0
        ? `Import ${candidateGap} more vetted ${circle.name} candidates.`
        : "Source coverage is acceptable under current targets."
  };
}

function sourceHealthStatus({ source, totalCandidates, healthScore, noiseRate, qualityRate }) {
  if (!source.enabled) return "disabled";
  if (!totalCandidates) return "needs_candidates";
  if (noiseRate >= 0.35 || (totalCandidates >= 5 && qualityRate < 0.15)) return "disable_candidate";
  if (healthScore >= 72) return "healthy";
  if (healthScore >= 45) return "tune";
  return "weak";
}

function sourceRecommendation({ status, totalCandidates, qualifiedCandidates, noiseCandidates, qualityRate, noiseRate }) {
  if (status === "disabled") return "Disabled in config. Keep off until manual testing proves useful.";
  if (status === "needs_candidates") return "Enabled but produced no active candidates. Check URL, filters, or source reliability.";
  if (status === "disable_candidate") return `High noise or low quality: ${noiseCandidates}/${totalCandidates} noisy, ${qualifiedCandidates} qualified. Tighten filters or disable.`;
  if (status === "tune") return `Keep testing, but tune include/exclude filters. Quality rate ${roundRate(qualityRate)}, noise rate ${roundRate(noiseRate)}.`;
  if (status === "weak") return "Weak source. Use as watch-only until it produces qualified candidates.";
  return "Keep. This source is producing usable candidates under current scoring.";
}

function sourceHealthRecommendations(sources, circles) {
  const actions = [];
  const disable = sources.find((source) => source.status === "disable_candidate");
  const needs = sources.find((source) => source.status === "needs_candidates");
  const sourceGap = circles.find((circle) => circle.sourceGap > 0);
  const candidateGap = circles.find((circle) => circle.candidateGap > 0);

  if (disable) actions.push(`Tune or disable ${disable.name}; it has ${disable.noiseCandidates} noisy candidates and ${disable.qualifiedCandidates} qualified candidates.`);
  if (needs) actions.push(`Check ${needs.name}; it is enabled but produced no active candidates.`);
  if (sourceGap) actions.push(`Add more ${sourceGap.name} sources; current enabled source gap is ${sourceGap.sourceGap}.`);
  if (candidateGap) actions.push(`Fill ${candidateGap.name}; source queue still needs ${candidateGap.candidateGap} candidates.`);
  return actions.slice(0, 6);
}
