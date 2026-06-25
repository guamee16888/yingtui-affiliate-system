import { XMLParser } from "fast-xml-parser";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createToolId, normalizeDomain } from "./ids.mjs";
import { writeJsonAtomic, writeTextAtomic } from "./file-store.mjs";
import { buildAccountStrategy, DEFAULT_ACCOUNT_CONFIG, normalizeAccountConfig } from "./account-system.mjs";
import { buildSourceDiscoveryPack, buildSourceHealth, buildSourceQualityQueue, buildSupplyPlan, DEFAULT_CONTENT_SOURCE_CONFIG } from "./content-source-system.mjs";
import { buildDraftPlan } from "./draft-planner.mjs";
import { buildContentCalendar } from "./content-calendar.mjs";
import { buildPromotionReviewQueue } from "./promotion-engine.mjs";
import { buildFeedbackLearningSignals, buildFeedbackOps } from "./feedback-ops.mjs";
import {
  buildHistoryIndex,
  daysSince,
  findAffiliate,
  scoreTool,
  toolKey
} from "./affiliate/scoring.mjs";
import {
  buildAffiliateStatus,
  makeCopyVariants,
  summarizeLint
} from "./affiliate/copy.mjs";
import { renderDailyMarkdown } from "./affiliate/render.mjs";

export {
  buildAngle,
  buildHistoryIndex,
  findAffiliate,
  inferPain,
  scoreTool
} from "./affiliate/scoring.mjs";
export {
  buildAffiliateStatus,
  lintTweet,
  makeCopyVariants,
  summarizeLint
} from "./affiliate/copy.mjs";
export { renderDailyMarkdown } from "./affiliate/render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");

export const DEFAULT_FEED = "https://www.producthunt.com/feed";
export const HISTORY_PATH = "data/history.json";
export const FALLBACK_FEED_PATH = "data/sample-producthunt-feed.xml";
export const LATEST_DAILY_PATH = "data/latest.json";

const DEFAULT_VOICE = {
  style: {
    maxTweetCharacters: 260,
    allowEmoji: false,
    avoid: [
      "game-changer",
      "revolutionize",
      "unlock",
      "seamless",
      "leverage",
      "boost productivity",
      "in today's fast-paced world",
      "delve",
      "ultimate",
      "cutting-edge",
      "effortlessly",
      "supercharge",
      "transform the way",
      "streamline",
      "robust"
    ]
  }
};

const DEFAULT_AFFILIATE_CONFIG = {
  links: []
};

export function parseArgs(argv) {
  const args = {
    feed: DEFAULT_FEED,
    limit: 40,
    date: todayInShanghai()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--feed") args.feed = argv[++index];
    if (arg === "--limit") args.limit = Number(argv[++index]);
    if (arg === "--date") args.date = argv[++index];
  }

  return args;
}

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

export async function loadJsonConfig(relativePath, fallback, warnings) {
  try {
    return JSON.parse(await readText(relativePath));
  } catch (error) {
    if (error.code === "ENOENT") {
      warnings.push(`Config missing: ${relativePath}. Using built-in defaults.`);
      return fallback;
    }

    throw new Error(`Config error in ${relativePath}: ${error.message}`, { cause: error });
  }
}

export async function loadVoice(warnings) {
  const voice = await loadJsonConfig("config/voice.json", DEFAULT_VOICE, warnings);
  return {
    ...DEFAULT_VOICE,
    ...voice,
    style: {
      ...DEFAULT_VOICE.style,
      ...(voice.style ?? {})
    }
  };
}

export async function loadAffiliateConfig(warnings) {
  const config = await loadJsonConfig("config/affiliate-links.json", DEFAULT_AFFILIATE_CONFIG, warnings);
  return {
    links: Array.isArray(config.links) ? config.links : []
  };
}

export async function loadAccountConfig(warnings) {
  const config = await loadJsonConfig("config/x-accounts.json", DEFAULT_ACCOUNT_CONFIG, warnings);
  return normalizeAccountConfig(config);
}

export async function loadHistory(warnings = []) {
  try {
    const history = JSON.parse(await readText(HISTORY_PATH));
    return {
      version: 1,
      ...history,
      tools: Array.isArray(history.tools) ? history.tools : []
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      warnings.push(`History missing: ${HISTORY_PATH}. A new file will be created on the next daily run.`);
      return { version: 1, tools: [] };
    }

    throw new Error(`History error in ${HISTORY_PATH}: ${error.message}`, { cause: error });
  }
}

export async function saveHistory(history) {
  await writeJsonAtomic(HISTORY_PATH, history);
}

export async function fetchFeedWithFallback(feedUrl, warnings) {
  try {
    const response = await fetch(feedUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "user-agent": "yingtui-affiliate-system/0.2"
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return {
      xml: await response.text(),
      source: feedUrl,
      usedFallback: false
    };
  } catch (error) {
    warnings.push(`Product Hunt feed unavailable: ${error.message}. Using local fallback sample.`);
    try {
      return {
        xml: await readText(FALLBACK_FEED_PATH),
        source: FALLBACK_FEED_PATH,
        usedFallback: true
      };
    } catch (fallbackError) {
      throw new Error(`Feed failed and fallback sample is unavailable: ${fallbackError.message}`, { cause: fallbackError });
    }
  }
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value = "") {
  return value
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

export function parseProductHuntFeed(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
  });
  const parsed = parser.parse(xml);
  const entries = asArray(parsed.feed?.entry);

  return entries.map((entry) => {
    const links = asArray(entry.link);
    const alternateLink = links.find((link) => link.rel === "alternate")?.href ?? "";
    const content = typeof entry.content === "object" ? entry.content["#text"] : entry.content;
    const description = stripHtml(content).replace(/\s*Discussion\s*\|\s*Link\s*$/i, "");

    return {
      id: entry.id,
      name: String(entry.title ?? "").trim(),
      url: alternateLink,
      tagline: description,
      description,
      published: entry.published,
      updated: entry.updated,
      author: entry.author?.name ?? "",
      sourceType: "producthunt",
      sourceName: "Product Hunt"
    };
  }).filter((tool) => tool.name && tool.url);
}

export function candidateInboxToTools(inbox, date) {
  return (inbox.items ?? [])
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
      tagline: item.tagline || item.description,
      description: item.description || item.tagline,
      published: item.published || `${date}T00:00:00+08:00`,
      updated: item.updatedAt,
      author: item.source || "manual",
      sourceType: "inbox",
      sourceName: item.source || "Candidate Inbox",
      sourceUrl: item.sourceUrl || "",
      sourceNote: item.notes || "",
      circle: item.circle || "",
      candidateType: item.candidateType || "product",
      accountId: item.accountId || "",
      accountName: item.accountName || "",
      seedId: item.seedId || ""
    }))
    .filter((tool) => tool.name && tool.url);
}

export function mergeToolSources(primaryTools, extraTools) {
  const seen = new Set();
  const merged = [];

  for (const tool of [...primaryTools, ...extraTools]) {
    const key = toolKey(tool);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tool);
  }

  return merged;
}

export function buildDailyModel({ date, feedSource, usedFallback, tools, history, affiliateConfig, accountConfig = DEFAULT_ACCOUNT_CONFIG, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG, sourceCandidates = null, feedback = { entries: [] }, accountPosts = { items: [] }, queues = { items: [] }, voice, limit, warnings, sourceBreakdown = null }) {
  const historyIndex = buildHistoryIndex(history, { beforeDate: date });
  const preflightFeedbackOps = buildFeedbackOps({
    date,
    latest: { tools: tools.map(toFeedbackToolJson) },
    feedback,
    accountPosts,
    accountConfig
  });
  const feedbackLearningSignals = buildFeedbackLearningSignals(preflightFeedbackOps);
  const context = { date, historyIndex, affiliateConfig, feedbackLearningSignals };
  const scored = tools
    .map((tool) => scoreTool(tool, context))
    .sort((a, b) => b.score - a.score);
  const qualityFloor = Number(contentSourceConfig.dailyTargets?.minimumQualityScore ?? 18);
  const basePicked = scored
    .filter((item) => item.followUpAction !== "skip" && item.score >= qualityFloor)
    .slice(0, limit);
  const accountStrategy = buildAccountStrategy({ date, picked: basePicked, accountConfig });
  const supplyPlan = buildSupplyPlan({ date, scored, accountStrategy, contentSourceConfig });
  const accountRecommendationByToolId = new Map(accountStrategy.toolRecommendations.map((item) => [item.toolId, item]));
  const picked = basePicked.map((item) => ({
    ...item,
    accountRecommendation: accountRecommendationByToolId.get(createToolId(item.tool.name, item.tool.url)) ?? null,
    copyVariants: makeCopyVariants(item, voice)
  }));
  const pickedKeys = new Set(picked.map((item) => toolKey(item.tool)));
  const lowPriority = scored
    .filter((item) => item.followUpAction === "skip" || !pickedKeys.has(toolKey(item.tool)))
    .slice(0, 8);
  const affiliateQueue = scored
    .filter((item) => !item.affiliate && item.scoreBreakdown.affiliateScore >= 6)
    .slice(0, 10);
  const actionList = buildActionList(picked, affiliateQueue, date, feedbackLearningSignals);
  const freshnessReport = buildFreshnessReport({ date, scored, picked, usedFallback, feedSource });
  const sourceQualityQueue = buildSourceQualityQueue({ supplyPlan, contentSourceConfig });
  const sourceDiscovery = buildSourceDiscoveryPack({ date, sourceQualityQueue, contentSourceConfig });
  const sourceHealth = buildSourceHealth({ date, sourceCandidates: sourceCandidates ?? { items: [] }, scored, contentSourceConfig, sourceQualityQueue });
  const draftPlan = buildDraftPlan({ date, picked, accountStrategy, targetPerAccount: supplyPlan.targetPerAccount });
  const contentCalendar = buildContentCalendar({ date, draftPlan, accountStrategy });
  const feedbackOps = buildFeedbackOps({
    date,
    latest: { tools: picked.map(toToolJson) },
    feedback,
    accountPosts,
    accountConfig
  });
  const promotionReview = buildPromotionReviewQueue({
    latest: {
      date,
      generatedAt: `${date}T12:00:00.000Z`,
      tools: picked.map(toToolJson)
    },
    history,
    feedback,
    queues,
    affiliateLinks: affiliateConfig
  });

  return {
    date,
    feedSource,
    usedFallback,
    sourceBreakdown,
    scored,
    picked,
    lowPriority,
    affiliateQueue,
    actionList,
    freshnessReport,
    accountStrategy,
    supplyPlan,
    sourceQualityQueue,
    sourceDiscovery,
    sourceHealth,
    draftPlan,
    contentCalendar,
    feedbackOps,
    feedbackLearningSignals,
    promotionReview,
    historySummary: summarizeHistory(history),
    warnings
  };
}

function toFeedbackToolJson(tool) {
  const toolId = createToolId(tool.name, tool.url);
  return {
    id: toolId,
    toolId,
    name: tool.name,
    url: tool.url,
    sourceId: tool.sourceId ?? "",
    sourceType: tool.sourceType ?? "producthunt",
    sourceName: tool.sourceName ?? "Product Hunt",
    circle: tool.circle ?? "",
    candidateType: tool.candidateType ?? "product",
    accountId: tool.accountId ?? "",
    accountName: tool.accountName ?? "",
    copyVariants: {}
  };
}

function buildFreshnessReport({ date, scored, picked, usedFallback, feedSource }) {
  const buckets = {
    freshToday: [],
    fresh48: [],
    fresh7d: [],
    older: [],
    unknown: []
  };

  for (const item of scored) {
    const bucket = freshnessBucket(item.tool.published, date);
    buckets[bucket].push(item);
  }

  const pickedFreshPostCandidates = picked.filter((item) => isFreshPostCandidate(item, date));
  const freshFeedWatchlist = [...buckets.freshToday, ...buckets.fresh48]
    .filter((item) => !item.seenBefore && item.followUpAction !== "skip" && !item.tool.sourceQuality?.isNoisy)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => freshnessToolSummary(item, date, picked));
  const newestFeedTools = [...scored]
    .sort((a, b) => freshnessSortValue(a, date) - freshnessSortValue(b, date) || b.score - a.score)
    .slice(0, 5)
    .map((item) => freshnessToolSummary(item, date, picked));
  const stats = {
    totalTools: scored.length,
    freshToday: buckets.freshToday.length,
    fresh48: buckets.fresh48.length,
    fresh7d: buckets.fresh7d.length,
    older: buckets.older.length,
    unknownPublished: buckets.unknown.length,
    lowOriginalityNews: scored.filter((item) => item.editorialSignals?.lowOriginalityNews).length,
    topPickFreshPostCandidates: pickedFreshPostCandidates.length,
    topPickSeenBefore: picked.filter((item) => item.seenBefore).length
  };

  return {
    source: feedSource,
    usedFallback,
    stats,
    publishableTools: pickedFreshPostCandidates.map((item) => freshnessToolSummary(item, date, picked)),
    freshFeedWatchlist,
    newestFeedTools,
    diagnosis: freshnessDiagnosis({ usedFallback, stats, freshFeedWatchlist }),
    recommendation: freshnessRecommendation({ usedFallback, stats, freshFeedWatchlist })
  };
}

function freshnessBucket(published, date) {
  const ageDays = daysSince(published, date);
  if (ageDays === null) return "unknown";
  if (ageDays <= 0) return "freshToday";
  if (ageDays <= 2) return "fresh48";
  if (ageDays <= 7) return "fresh7d";
  return "older";
}

function freshnessSortValue(item, date) {
  const ageDays = daysSince(item.tool.published, date);
  return ageDays === null ? 9999 : ageDays;
}

function freshnessToolSummary(item, date, picked) {
  const inTopPicks = picked.some((pickedItem) => toolKey(pickedItem.tool) === toolKey(item.tool));
  return {
    name: item.tool.name,
    url: item.tool.url,
    published: item.tool.published ?? null,
    sourceId: item.tool.sourceId ?? "",
    sourceType: item.tool.sourceType ?? "producthunt",
    sourceName: item.tool.sourceName ?? "Product Hunt",
    ageDays: daysSince(item.tool.published, date),
    score: item.score,
    followUpAction: item.followUpAction,
    editorialSignals: item.editorialSignals ?? null,
    seenBefore: item.seenBefore,
    inTopPicks
  };
}

function freshnessDiagnosis({ usedFallback, stats, freshFeedWatchlist }) {
  if (usedFallback) return "Using fallback sample data, so freshness cannot be trusted.";
  if (stats.topPickFreshPostCandidates > 0) return "Top picks include fresh candidates that are suitable for cautious posting.";
  if (stats.freshToday + stats.fresh48 > 0 && freshFeedWatchlist.length > 0) {
    return "The feed has fresh tools, but they did not beat older tools on affiliate/content score.";
  }
  if (stats.freshToday + stats.fresh48 > 0) return "The feed has fresh tools, but they were already seen or not strong enough for posting.";
  return "The Product Hunt feed has no unseen tools from the last 48 hours in this run.";
}

function freshnessRecommendation({ usedFallback, stats, freshFeedWatchlist }) {
  if (usedFallback) return "Do not publish through the API. Refresh later or fix the feed connection.";
  if (stats.topPickFreshPostCandidates > 0) return "Post only the Fresh today / Fresh 48h candidates, then record feedback.";
  if (freshFeedWatchlist.length > 0) return "Inspect the fresh feed watchlist manually; otherwise spend today on affiliate research or review outlines.";
  return "Do not spend X API credits right now. Refresh later, or work on affiliate research and SEO review candidates.";
}

function buildActionList(picked, affiliateQueue, date, feedbackLearningSignals = null) {
  const actions = [];
  if (["metrics_blocked", "clear_feedback_debt"].includes(feedbackLearningSignals?.status)) {
    actions.push({
      type: "fill feedback",
      toolName: "X Analytics",
      detail: feedbackLearningSignals.headline
    });
  }
  const postCandidates = picked.filter((item) => isFreshPostCandidate(item, date)).slice(0, 3);

  for (const item of postCandidates) {
    actions.push({
      type: "post",
      toolName: item.tool.name,
      detail: `Post one X draft: ${item.copyVariants[0]?.text ?? item.tool.url}`
    });
  }

  if (!postCandidates.length) {
    actions.push({
      type: "wait",
      toolName: "No fresh post",
      detail: "No Product Hunt candidate is fresh enough for paid API publishing. Refresh later or work on affiliate/review research."
    });
  }

  const affiliateCandidate = affiliateQueue.find((item) => item.followUpAction === "affiliate priority") ?? affiliateQueue[0];
  if (affiliateCandidate) {
    actions.push({
      type: "research affiliate",
      toolName: affiliateCandidate.tool.name,
      detail: `Check whether ${affiliateCandidate.tool.name} has an affiliate, partner, or referral program.`
    });
  }

  const longformCandidate = picked.find((item) => item.followUpAction === "review page candidate")
    ?? picked.find((item) => item.followUpAction === "thread candidate");
  if (longformCandidate) {
    actions.push({
      type: "longform",
      toolName: longformCandidate.tool.name,
      detail: `Save ${longformCandidate.tool.name} for a thread or SEO review page if the X post gets feedback.`
    });
  }

  return actions.slice(0, 5);
}

function isFreshPostCandidate(item, date) {
  const ageDays = daysSince(item.tool.published, date);
  return !item.seenBefore
    && item.followUpAction !== "skip"
    && !item.editorialSignals?.lowOriginalityNews
    && Number(item.scoreBreakdown?.originalityPenalty ?? 0) < 8
    && ageDays !== null
    && ageDays <= 2;
}

export async function writeDailyOutput(model) {
  const outputDir = path.join(rootDir, "output");
  await mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `${model.date}-daily-x-pack.md`);
  await writeTextAtomic(outputFile, renderDailyMarkdown(model));
  return outputFile;
}

export async function writeDailyJsonOutputs(model) {
  const dailyDir = path.join(rootDir, "data/daily");
  await mkdir(dailyDir, { recursive: true });
  const dailyFile = path.join(dailyDir, `${model.date}.json`);
  const latestFile = path.join(rootDir, LATEST_DAILY_PATH);
  const data = toDailyJson(model);

  await Promise.all([
    writeJsonAtomic(dailyFile, data),
    writeJsonAtomic(latestFile, data)
  ]);

  return {
    dailyFile,
    latestFile
  };
}

export function toDailyJson(model) {
  const seenBeforeCount = model.picked.filter((item) => item.seenBefore).length;

  return {
    date: model.date,
    generatedAt: new Date().toISOString(),
    source: {
      feed: model.feedSource,
      usedFallback: model.usedFallback,
      breakdown: model.sourceBreakdown ?? {
        productHuntTools: model.scored.length,
        candidateInboxTools: 0,
        sourceCandidateTools: 0,
        mergedTools: model.scored.length
      }
    },
    warnings: model.warnings,
    summary: {
      totalTools: model.scored.length,
      topPicks: model.picked.length,
      affiliateQueueCount: model.affiliateQueue.length,
      candidateInboxCount: model.sourceBreakdown?.candidateInboxTools ?? 0,
      sourceCandidateCount: model.sourceBreakdown?.sourceCandidateTools ?? 0,
      seenBeforeCount
    },
    freshnessReport: model.freshnessReport,
    accountStrategy: model.accountStrategy,
    supplyPlan: model.supplyPlan,
    sourceQualityQueue: model.sourceQualityQueue,
    sourceDiscovery: model.sourceDiscovery,
    sourceHealth: model.sourceHealth,
    draftPlan: model.draftPlan,
    contentCalendar: model.contentCalendar,
    feedbackOps: model.feedbackOps,
    feedbackLearningSignals: model.feedbackLearningSignals,
    promotionReview: model.promotionReview,
    actionList: model.actionList.map((action) => ({
      type: action.type,
      toolName: action.toolName,
      reason: action.detail
    })),
    tools: model.picked.map(toToolJson),
    skippedTools: model.lowPriority.map(toToolJson),
    affiliateResearchQueue: model.affiliateQueue.map(toAffiliateQueueJson),
    historicalNotes: [
      `History records before this run: ${model.historySummary.totalRecords}`,
      `Unique tools seen: ${model.historySummary.uniqueTools}`,
      `Last history date before this run: ${model.historySummary.lastDate ?? "none"}`,
      `Seen-before tools in today's picks: ${seenBeforeCount}`,
      `Records written by this run: ${model.picked.length}`
    ]
  };
}

function toToolJson(item) {
  const affiliateStatus = buildAffiliateStatus(item);
  const copyVariants = item.copyVariants ?? [];
  const toolId = createToolId(item.tool.name, item.tool.url);

  return {
    id: toolId,
    toolId,
    name: item.tool.name,
    url: item.tool.url,
    domain: normalizeDomain(item.tool.url),
    tagline: item.tool.tagline,
    published: item.tool.published ?? null,
    sourceId: item.tool.sourceId ?? "",
    sourceType: item.tool.sourceType ?? "producthunt",
    sourceName: item.tool.sourceName ?? "Product Hunt",
    sourceUrl: item.tool.sourceUrl ?? null,
    sourceNote: item.tool.sourceNote ?? null,
    sourceQuality: item.tool.sourceQuality ?? {
      status: "ok",
      isNoisy: false,
      reason: "Not checked by source quality gate.",
      blockedTerms: [],
      matchedTerms: []
    },
    circle: item.tool.circle ?? "",
    candidateType: item.tool.candidateType ?? "product",
    accountId: item.tool.accountId ?? "",
    accountName: item.tool.accountName ?? "",
    seedId: item.tool.seedId ?? "",
    score: item.score,
    scoreBreakdown: item.scoreBreakdown,
    reason: item.reason,
    editorialSignals: item.editorialSignals ?? null,
    affiliateStatus: affiliateStatus.hasLink ? "matched" : affiliateStatusForItem(item),
    affiliateLink: item.affiliate?.affiliateUrl ?? null,
    affiliateNote: item.affiliate?.note ?? null,
    followUpAction: item.followUpAction,
    accountRecommendation: item.accountRecommendation ?? null,
    seenBefore: item.seenBefore,
    seenBeforeDetails: item.historyInfo ? {
      count: item.historyInfo.count,
      lastSeen: item.historyInfo.lastSeen,
      bestScore: item.historyInfo.bestScore
    } : null,
    suggestedAngle: `${item.angle.audience} want ${item.angle.outcome}; test whether it solves ${item.angle.pain}.`,
    angle: item.angle,
    copyVariants: copyVariants.reduce((variants, variant) => {
      variants[variant.label] = variant.text;
      return variants;
    }, {}),
    copyChecks: copyVariants.reduce((checks, variant) => {
      checks[variant.label] = {
        ok: variant.lint.ok,
        length: variant.lint.length,
        issues: summarizeLint(variant.lint)
      };
      return checks;
    }, {})
  };
}

function affiliateStatusForItem(item) {
  if (item.followUpAction === "skip" && item.scoreBreakdown.affiliateScore < 6) return "no_fit";
  return "research_needed";
}

function toAffiliateQueueJson(item) {
  return {
    name: item.tool.name,
    url: item.tool.url,
    tagline: item.tool.tagline,
    score: item.score,
    affiliateScore: item.scoreBreakdown.affiliateScore,
    followUpAction: item.followUpAction,
    reason: "No affiliate link yet — research needed"
  };
}

export function updateHistory(history, date, picked) {
  const recordsByDateAndTool = new Map(history.tools.map((record) => [`${record.date}::${toolKey(record)}`, record]));

  for (const item of picked) {
    const key = `${date}::${toolKey(item.tool)}`;
      recordsByDateAndTool.set(key, {
      date,
      toolId: createToolId(item.tool.name, item.tool.url),
      toolName: item.tool.name,
      url: item.tool.url,
      domain: normalizeDomain(item.tool.url),
      tagline: item.tool.tagline,
      score: item.score,
      scoreBreakdown: item.scoreBreakdown,
      seenBefore: item.seenBefore,
      followUpAction: item.followUpAction,
      recommendedToFollow: item.recommendedToFollow,
      affiliateMatched: Boolean(item.affiliate),
      affiliateStatus: buildAffiliateStatus(item).text
    });
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    tools: Array.from(recordsByDateAndTool.values()).sort((a, b) => {
      if (a.date === b.date) return b.score - a.score;
      return String(a.date).localeCompare(String(b.date));
    })
  };
}

export function summarizeHistory(history) {
  const uniqueKeys = new Set(history.tools.map(toolKey));
  const lastDate = history.tools.reduce((latest, record) => {
    if (!record.date) return latest;
    return !latest || record.date > latest ? record.date : latest;
  }, "");

  return {
    totalRecords: history.tools.length,
    uniqueTools: uniqueKeys.size,
    lastDate: lastDate || null
  };
}

export function renderHistorySummary(history) {
  const summary = summarizeHistory(history);
  const recent = [...history.tools]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.score - a.score)
    .slice(0, 12);
  const followUps = [...history.tools]
    .filter((record) => record.recommendedToFollow)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return `# Affiliate Topic History

- History records: ${summary.totalRecords}
- Unique tools: ${summary.uniqueTools}
- Latest date: ${summary.lastDate ?? "none"}

## Recent Records

${recent.length ? recent.map((record) => `- ${record.date}: ${record.toolName} — ${record.score} points — ${record.followUpAction}`).join("\n") : "No history yet. Run `npm run daily` first."}

## Follow-up Candidates

${followUps.length ? followUps.map((record) => `- ${record.toolName} — ${record.score} points — ${record.followUpAction} — ${record.url}`).join("\n") : "No follow-up candidates yet."}
`;
}

export function renderAffiliateQueueFromHistory(history, affiliateConfig) {
  const latestByTool = new Map();

  for (const record of history.tools) {
    const key = toolKey(record);
    const existing = latestByTool.get(key);
    if (!existing || String(record.date) > String(existing.date) || record.score > existing.score) {
      latestByTool.set(key, record);
    }
  }

  const queue = Array.from(latestByTool.values())
    .filter((record) => {
      const affiliateScore = Number(record.scoreBreakdown?.affiliateScore ?? 0);
      const tool = {
        name: record.toolName,
        url: record.url,
        description: record.tagline ?? ""
      };
      return affiliateScore >= 6 && !findAffiliate(tool, affiliateConfig);
    })
    .sort((a, b) => {
      const affiliateDiff = Number(b.scoreBreakdown?.affiliateScore ?? 0) - Number(a.scoreBreakdown?.affiliateScore ?? 0);
      if (affiliateDiff !== 0) return affiliateDiff;
      return b.score - a.score;
    });

  return `# Affiliate Research Queue

${queue.length ? queue.map((record, index) => {
    return `${index + 1}. ${record.toolName} — affiliateScore ${record.scoreBreakdown.affiliateScore}, total ${record.score}. No affiliate link yet — research needed. ${record.url}`;
  }).join("\n") : "No affiliate research items yet. Run `npm run daily`, or lower the threshold in the script if this is too strict."}
`;
}
