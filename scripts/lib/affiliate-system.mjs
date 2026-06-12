import { XMLParser } from "fast-xml-parser";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createToolId, normalizeDomain } from "./ids.mjs";
import { writeJsonAtomic, writeTextAtomic } from "./file-store.mjs";
import { buildAccountStrategy, DEFAULT_ACCOUNT_CONFIG, normalizeAccountConfig } from "./account-system.mjs";
import { buildSourceQualityQueue, buildSupplyPlan, DEFAULT_CONTENT_SOURCE_CONFIG } from "./content-source-system.mjs";
import { buildDraftPlan } from "./draft-planner.mjs";
import { buildContentCalendar } from "./content-calendar.mjs";
import { buildPromotionReviewQueue } from "./promotion-engine.mjs";

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

const painKeywords = [
  "no code",
  "automate",
  "automation",
  "shopify",
  "ecommerce",
  "notion",
  "excel",
  "spreadsheet",
  "invoice",
  "meeting",
  "transcription",
  "sales",
  "email",
  "resume",
  "customer",
  "support",
  "website",
  "seo",
  "analytics",
  "api",
  "database",
  "chrome",
  "slack",
  "figma",
  "github",
  "developer",
  "marketer",
  "freelancer",
  "creator",
  "deliverability",
  "founder",
  "startup",
  "saas",
  "b2b",
  "pricing",
  "onboarding",
  "retention",
  "indie",
  "launch",
  "crypto",
  "wallet",
  "onchain",
  "defi"
];

const nicheKeywords = [
  "shopify",
  "ecommerce",
  "notion",
  "figma",
  "github",
  "chrome",
  "slack",
  "spreadsheet",
  "excel",
  "invoice",
  "resume",
  "email",
  "seo",
  "developer",
  "customer support",
  "sales",
  "freelancer",
  "creator",
  "publisher",
  "marketer",
  "founder",
  "startup",
  "saas",
  "b2b",
  "indie",
  "crypto",
  "wallet",
  "onchain"
];

const affiliateKeywords = [
  "shopify",
  "ecommerce",
  "sales",
  "email",
  "deliverability",
  "customer",
  "support",
  "seo",
  "analytics",
  "api",
  "developer",
  "no code",
  "automation",
  "invoice",
  "resume",
  "database",
  "website",
  "subscription",
  "pricing",
  "teams",
  "saas",
  "b2b",
  "startup",
  "founder",
  "wallet",
  "analytics",
  "trading"
];

const contentKeywords = [
  "alternative",
  "pricing",
  "compare",
  "without",
  "no code",
  "from one",
  "local",
  "account needed",
  "deliverability",
  "support",
  "workflow",
  "automation",
  "tool",
  "builder",
  "launch",
  "pricing",
  "growth",
  "founder",
  "onchain",
  "wallet"
];

const broadPenaltyKeywords = [
  "all-in-one",
  "platform",
  "assistant",
  "chatbot",
  "ai app",
  "everything",
  "personal ai",
  "agentic",
  "vibe"
];

const hotSpotKeywords = [
  "agent",
  "agents",
  "chatbot",
  "vibe",
  "personal ai",
  "all-in-one"
];

const bigBrandKeywords = [
  "google",
  "microsoft",
  "openai",
  "meta",
  "apple",
  "amazon"
];

const audienceMap = [
  ["shopify", "Shopify stores"],
  ["ecommerce", "ecommerce operators"],
  ["sales", "sales teams"],
  ["email", "people who live in email"],
  ["deliverability", "cold email operators"],
  ["meeting", "busy teams"],
  ["transcription", "busy teams"],
  ["resume", "job seekers"],
  ["seo", "indie marketers"],
  ["notion", "Notion-heavy teams"],
  ["figma", "design teams"],
  ["github", "developers"],
  ["api", "developers"],
  ["developer", "developers"],
  ["spreadsheet", "spreadsheet people"],
  ["excel", "spreadsheet people"],
  ["invoice", "freelancers"],
  ["website", "site owners"],
  ["support", "support teams"],
  ["customer", "support teams"],
  ["creator", "creators"],
  ["publisher", "publishers"],
  ["founder", "founders"],
  ["startup", "startup operators"],
  ["saas", "SaaS founders"],
  ["b2b", "B2B SaaS teams"],
  ["indie", "indie builders"],
  ["crypto", "crypto builders"],
  ["wallet", "wallet teams"],
  ["onchain", "onchain operators"]
];

const outcomeMap = [
  ["shopify", "better store operations"],
  ["ecommerce", "cleaner store operations"],
  ["email", "fewer email deliverability headaches"],
  ["deliverability", "fewer email deliverability headaches"],
  ["meeting", "less meeting cleanup"],
  ["transcription", "less meeting cleanup"],
  ["resume", "a cleaner job-search workflow"],
  ["seo", "more specific SEO work"],
  ["analytics", "faster reporting"],
  ["api", "less glue code"],
  ["developer", "less workflow friction"],
  ["spreadsheet", "less spreadsheet cleanup"],
  ["excel", "less spreadsheet cleanup"],
  ["invoice", "faster invoicing"],
  ["website", "a better site workflow"],
  ["support", "fewer repetitive support tasks"],
  ["customer", "fewer repetitive support tasks"],
  ["founder", "a sharper founder workflow"],
  ["startup", "a sharper startup workflow"],
  ["saas", "a more concrete SaaS operating angle"],
  ["b2b", "a more concrete B2B operating angle"],
  ["indie", "a smaller builder workflow"],
  ["crypto", "a clearer crypto builder angle"],
  ["wallet", "a better wallet workflow"],
  ["onchain", "a clearer onchain workflow"]
];

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

    throw new Error(`Config error in ${relativePath}: ${error.message}`);
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
      tools: [],
      ...history,
      tools: Array.isArray(history.tools) ? history.tools : []
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      warnings.push(`History missing: ${HISTORY_PATH}. A new file will be created on the next daily run.`);
      return { version: 1, tools: [] };
    }

    throw new Error(`History error in ${HISTORY_PATH}: ${error.message}`);
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
      throw new Error(`Feed failed and fallback sample is unavailable: ${fallbackError.message}`);
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
      candidateType: item.candidateType || "product"
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

function clamp(value, min = 0, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function countMatches(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword)).length;
}

function hasMatch(text, keywords) {
  return countMatches(text, keywords) > 0;
}

function chooseFromMap(text, pairs, fallback) {
  const lower = text.toLowerCase();
  const match = pairs.find(([keyword]) => lower.includes(keyword));
  return match?.[1] ?? fallback;
}

function daysSince(dateText, todayText) {
  if (!dateText) return null;
  const published = new Date(dateText);
  const today = new Date(`${todayText}T00:00:00+08:00`);
  if (Number.isNaN(published.getTime())) return null;
  return Math.max(0, Math.round((today.getTime() - published.getTime()) / 86400000));
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function toolKey(toolOrRecord) {
  const url = normalizeText(toolOrRecord.url);
  if (url) return url.replace(/\?.*$/, "").replace(/\/$/, "");
  return normalizeText(toolOrRecord.name ?? toolOrRecord.toolName);
}

export function buildHistoryIndex(history, options = {}) {
  const index = new Map();
  const beforeDate = options.beforeDate ? String(options.beforeDate) : null;

  for (const record of history.tools) {
    if (beforeDate && String(record.date) >= beforeDate) continue;
    const key = toolKey(record);
    const existing = index.get(key) ?? {
      count: 0,
      lastSeen: "",
      bestScore: Number.NEGATIVE_INFINITY
    };

    existing.count += 1;
    if (!existing.lastSeen || String(record.date) > existing.lastSeen) existing.lastSeen = record.date;
    if (Number(record.score) > existing.bestScore) existing.bestScore = Number(record.score);
    index.set(key, existing);
  }

  return index;
}

export function inferPain(text) {
  const lower = text.toLowerCase();
  if (lower.includes("shopify")) return "changing store ops without touching five admin screens";
  if (lower.includes("email") || lower.includes("deliverability")) return "getting emails out of spam before a launch";
  if (lower.includes("meeting") || lower.includes("transcription")) return "turning meetings into notes without another login";
  if (lower.includes("resume")) return "making job-search paperwork less painful";
  if (lower.includes("support") || lower.includes("customer")) return "answering repeat customer questions without adding another queue";
  if (lower.includes("seo")) return "finding a cleaner SEO angle without buying a huge suite";
  if (lower.includes("spreadsheet") || lower.includes("excel")) return "cleaning up spreadsheet work that should not be manual";
  if (lower.includes("website") || lower.includes("no code")) return "changing a site without waiting on a dev ticket";
  if (lower.includes("api") || lower.includes("coding") || lower.includes("developer")) return "removing one annoying developer workflow step";
  return "removing one narrow, repeated manual step";
}

function inferSolution(tool) {
  const description = tool.description.replace(/[.。]$/, "");
  if (!description) return "prove it saves time on a real workflow";
  const shortDescription = description.length <= 90
    ? description
    : `${description.slice(0, 87).trim()}...`;

  return shortDescription
    .toLowerCase()
    .replace(/\bai\b/g, "AI")
    .replace(/\bapi\b/g, "API")
    .replace(/\bseo\b/g, "SEO")
    .replace(/\bshopify\b/g, "Shopify")
    .replace(/\bchrome\b/g, "Chrome")
    .replace(/\bgsuite\b/g, "Google Workspace");
}

export function buildAngle(tool) {
  const text = `${tool.name} ${tool.description}`;
  const audience = chooseFromMap(text, audienceMap, "solo operators");
  const outcome = chooseFromMap(text, outcomeMap, "a narrower workflow");

  return {
    audience,
    outcome,
    pain: inferPain(text),
    solution: inferSolution(tool)
  };
}

function publishedNovelty(tool, date) {
  const age = daysSince(tool.published, date);
  if (age === null) return 2;
  if (age <= 2) return 5;
  if (age <= 7) return 4;
  if (age <= 30) return 2;
  return 1;
}

export function findAffiliate(tool, affiliateConfig) {
  const haystack = `${tool.name} ${tool.url} ${tool.description}`.toLowerCase();

  return affiliateConfig.links.find((item) => {
    const terms = [
      item.match,
      ...(Array.isArray(item.keywords) ? item.keywords : []),
      ...(Array.isArray(item.domains) ? item.domains : [])
    ].filter(Boolean);

    return terms.some((term) => haystack.includes(String(term).toLowerCase()));
  });
}

export function scoreTool(tool, context) {
  const text = `${tool.name} ${tool.description} ${tool.circle ?? ""} ${tool.candidateType ?? ""} ${tool.sourceName ?? ""}`.toLowerCase();
  const angle = buildAngle(tool);
  const affiliate = findAffiliate(tool, context.affiliateConfig);
  const historyInfo = context.historyIndex.get(toolKey(tool));
  const seenBefore = Boolean(historyInfo);
  const titleWords = tool.name.split(/\s+/).filter(Boolean).length;
  const descriptionLength = tool.description.length;
  const painMatches = countMatches(text, painKeywords);
  const nicheMatches = countMatches(text, nicheKeywords);
  const affiliateMatches = countMatches(text, affiliateKeywords);
  const contentMatches = countMatches(text, contentKeywords);
  const broadMatches = countMatches(text, broadPenaltyKeywords);
  const hotMatches = countMatches(text, hotSpotKeywords);
  const bigBrandMatches = countMatches(text, bigBrandKeywords);

  const painScore = clamp((painMatches * 2) + (descriptionLength >= 45 ? 2 : 0) + (angle.pain ? 2 : 0));
  const nicheScore = clamp((nicheMatches * 2) + (chooseFromMap(text, audienceMap, "") ? 3 : 0) + (titleWords >= 2 ? 1 : 0));
  const affiliateScore = clamp((affiliateMatches * 2) + (affiliate ? 3 : 0) + (hasMatch(text, ["team", "store", "sales", "customer", "email"]) ? 2 : 0));
  const contentScore = clamp((contentMatches * 2) + (painScore >= 6 ? 2 : 0) + (nicheScore >= 6 ? 2 : 0) + (descriptionLength <= 120 ? 1 : 0));
  const noveltyScore = clamp(publishedNovelty(tool, context.date) + (titleWords >= 2 ? 2 : 0) + (hasMatch(text, ["new", "launch", "2.0", "beta"]) ? 1 : 0));
  const riskScore = clamp((broadMatches * 2) + hotMatches + (bigBrandMatches * 2) + (nicheScore <= 3 ? 2 : 0) + (painScore <= 3 ? 2 : 0));
  const seenPenalty = seenBefore ? (historyInfo.lastSeen === context.date ? 6 : 4) : 0;
  const score = painScore + nicheScore + affiliateScore + contentScore + noveltyScore - riskScore - seenPenalty;

  const scoreBreakdown = {
    painScore,
    nicheScore,
    affiliateScore,
    contentScore,
    noveltyScore,
    riskScore,
    seenPenalty,
    total: score
  };

  const followUpAction = chooseFollowUpAction(scoreBreakdown, affiliate);
  const recommendedToFollow = ["thread candidate", "review page candidate", "affiliate priority"].includes(followUpAction);

  return {
    tool,
    angle,
    affiliate,
    score,
    scoreBreakdown,
    seenBefore,
    historyInfo,
    followUpAction,
    recommendedToFollow,
    reason: buildReason(scoreBreakdown, angle, affiliate, seenBefore, followUpAction)
  };
}

function chooseFollowUpAction(scoreBreakdown, affiliate) {
  const { total, painScore, nicheScore, affiliateScore, contentScore, riskScore } = scoreBreakdown;

  if (total < 18 || riskScore >= 8) return "skip";
  if (!affiliate && affiliateScore >= 8 && painScore >= 6 && nicheScore >= 5) return "affiliate priority";
  if (contentScore >= 8 && affiliateScore >= 6 && painScore >= 6) return "review page candidate";
  if (contentScore >= 7 && painScore >= 6) return "thread candidate";
  return "tweet only";
}

function buildReason(scoreBreakdown, angle, affiliate, seenBefore, action) {
  const strengths = [];
  const cautions = [];

  if (scoreBreakdown.painScore >= 7) strengths.push(`clear pain: ${angle.pain}`);
  if (scoreBreakdown.nicheScore >= 7) strengths.push(`specific buyer: ${angle.audience}`);
  if (scoreBreakdown.affiliateScore >= 7) strengths.push("paid-tool or subscription intent looks plausible");
  if (scoreBreakdown.contentScore >= 7) strengths.push("easy before/after/price/alternative content angle");
  if (scoreBreakdown.noveltyScore >= 6) strengths.push("fresh enough to test now");
  if (affiliate) strengths.push("affiliate link already configured");

  if (scoreBreakdown.riskScore >= 6) cautions.push("broad or crowded angle risk");
  if (seenBefore) cautions.push("Seen before, so it is downgraded today");
  if (action === "skip") cautions.push("not enough signal for follow-up");

  if (strengths.length === 0) strengths.push("has at least one narrow workflow angle");

  return `${strengths.join("; ")}.${cautions.length ? ` Caution: ${cautions.join("; ")}.` : ""}`;
}

function cleanSlot(value, voice) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  for (const phrase of voice.style.avoid ?? []) {
    text = text.replace(new RegExp(escapeRegExp(phrase), "ig"), "").replace(/\s+/g, " ").trim();
  }
  return text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fillTemplate(template, item, voice, link) {
  const values = {
    name: cleanSlot(item.tool.name, voice),
    audience: cleanSlot(item.angle.audience, voice),
    pain: cleanSlot(item.angle.pain, voice),
    solution: cleanSlot(item.angle.solution, voice),
    outcome: cleanSlot(item.angle.outcome, voice),
    sourceName: cleanSlot(item.tool.sourceName || "the feed", voice),
    link
  };

  return Object.entries(values).reduce((text, [key, value]) => {
    return text.replaceAll(`{${key}}`, value);
  }, template);
}

export function lintTweet(tweet, voice) {
  const lower = tweet.toLowerCase();
  const banned = (voice.style.avoid ?? []).filter((phrase) => lower.includes(phrase.toLowerCase()));
  const xLength = tweet.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
  const tooLong = xLength > voice.style.maxTweetCharacters;
  const emojiUsed = voice.style.allowEmoji ? false : /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(tweet);

  return {
    ok: banned.length === 0 && !tooLong && !emojiUsed,
    banned,
    tooLong,
    emojiUsed,
    length: xLength
  };
}

function ensureTweet(text, item, voice, link) {
  let candidate = text.replace(/\s+/g, " ").trim();
  let lint = lintTweet(candidate, voice);

  if (lint.banned.length) {
    for (const phrase of lint.banned) {
      candidate = candidate.replace(new RegExp(escapeRegExp(phrase), "ig"), "").replace(/\s+/g, " ").trim();
    }
    lint = lintTweet(candidate, voice);
  }

  if (!lint.ok) {
    candidate = item.tool.candidateType === "topic"
      ? `${item.tool.name}: useful signal, but not a tool review. I would verify the details before posting more. ${link}`
      : `${item.tool.name}: ${item.angle.pain}. I'd test it once before writing more. ${link}`;
    lint = lintTweet(candidate, voice);
  }

  if (!lint.ok) {
    candidate = item.tool.candidateType === "topic"
      ? `Worth watching: ${item.tool.name}. Treat it as a signal, not a claim. ${link}`
      : `Worth testing: ${item.tool.name}. Narrow problem, clear buyer. ${link}`;
    lint = lintTweet(candidate, voice);
  }

  return {
    text: candidate,
    lint
  };
}

export function makeCopyVariants(item, voice) {
  const link = item.affiliate?.affiliateUrl ?? item.tool.url;
  const isTopic = item.tool.candidateType === "topic";
  const templates = isTopic ? {
    shortPost: "Worth watching: {name}. I would not treat it as a tool review. The useful angle is what it says about {audience}. {link}",
    casualPost: "Saving this from {sourceName}. Not a recommendation, more of a market signal: {solution}. I would verify the details before posting a stronger take. {link}",
    contrarianAngle: "Most people will repeat the headline. The better post is probably the second-order question: what changes for {audience}? {link}",
    painPointHook: "The hook here is not the news itself. It is the pain underneath: {pain}. Worth watching before turning it into a thread. {link}",
    threadOpening: "If I turned this into a thread, I would keep it sober: who is affected, what changed, what is still uncertain, and whether builders can act on it. {link}"
  } : {
    shortPost: "Testing {name} today. It looks narrow enough to be useful: {pain}. Worth a quick look if you care about {outcome}. {link}",
    casualPost: "I like AI tools more when the buyer is obvious. {name} seems built for {audience}, not everyone. I'd test setup, pricing, and one real use case first. {link}",
    contrarianAngle: "Hot take: broad AI tools are harder to write about. {name} is smaller, which may be better. Clear buyer, clear pain, easier comparison. {link}",
    painPointHook: "People actually search for ways to fix {pain}. That's why {name} is more interesting than another vague launch. {link}",
    threadOpening: "I found {name} on Product Hunt and would not judge it by the launch copy. I'd test 4 things: the problem, the workflow, the pricing, and the closest alternative. {link}"
  };

  return Object.entries(templates).map(([label, template]) => ({
    label,
    ...ensureTweet(fillTemplate(template, item, voice, link), item, voice, link)
  }));
}

export function summarizeLint(lint) {
  if (lint.ok) return `OK (${lint.length} chars)`;
  const issues = [];
  if (lint.tooLong) issues.push(`${lint.length} chars`);
  if (lint.banned.length) issues.push(`banned: ${lint.banned.join(", ")}`);
  if (lint.emojiUsed) issues.push("emoji not allowed");
  return issues.join("; ");
}

export function buildAffiliateStatus(item) {
  if (item.affiliate) {
    return {
      text: `[Affiliate link configured](${item.affiliate.affiliateUrl}) (${item.affiliate.note ?? "matched"})`,
      hasLink: true
    };
  }

  return {
    text: "No affiliate link yet — research needed",
    hasLink: false
  };
}

export function buildDailyModel({ date, feedSource, usedFallback, tools, history, affiliateConfig, accountConfig = DEFAULT_ACCOUNT_CONFIG, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG, feedback = { entries: [] }, queues = { items: [] }, voice, limit, warnings, sourceBreakdown = null }) {
  const historyIndex = buildHistoryIndex(history, { beforeDate: date });
  const context = { date, historyIndex, affiliateConfig };
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
  const actionList = buildActionList(picked, affiliateQueue, date);
  const freshnessReport = buildFreshnessReport({ date, scored, picked, usedFallback, feedSource });
  const sourceQualityQueue = buildSourceQualityQueue({ supplyPlan, contentSourceConfig });
  const draftPlan = buildDraftPlan({ date, picked, accountStrategy, targetPerAccount: supplyPlan.targetPerAccount });
  const contentCalendar = buildContentCalendar({ date, draftPlan, accountStrategy });
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
    draftPlan,
    contentCalendar,
    promotionReview,
    historySummary: summarizeHistory(history),
    warnings
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
    .filter((item) => !item.seenBefore)
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
    sourceType: item.tool.sourceType ?? "producthunt",
    sourceName: item.tool.sourceName ?? "Product Hunt",
    ageDays: daysSince(item.tool.published, date),
    score: item.score,
    followUpAction: item.followUpAction,
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

function buildActionList(picked, affiliateQueue, date) {
  const actions = [];
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
  return !item.seenBefore && item.followUpAction !== "skip" && ageDays !== null && ageDays <= 2;
}

export function renderDailyMarkdown(model) {
  const freshCount = model.picked.filter((item) => !item.seenBefore).length;
  const seenCount = model.picked.length - freshCount;
  const topScore = model.picked[0]?.score ?? 0;
  const warningBlock = model.warnings.length
    ? `\n## Warnings\n\n${model.warnings.map((warning) => `- ${warning}`).join("\n")}\n`
    : "";

  return `# Daily English X Pack - ${model.date}

## Summary

- Source: ${model.feedSource}${model.usedFallback ? " (fallback sample)" : ""}
- Source mix: Product Hunt ${model.sourceBreakdown?.productHuntTools ?? model.scored.length}, Candidate Inbox ${model.sourceBreakdown?.candidateInboxTools ?? 0}, Source Candidates ${model.sourceBreakdown?.sourceCandidateTools ?? 0}, merged ${model.sourceBreakdown?.mergedTools ?? model.scored.length}
- Evaluated: ${model.scored.length} tools
- Picked: ${model.picked.length} tools (${freshCount} fresh, ${seenCount} Seen before)
- Top score: ${topScore}
- Rule: drafts are material, not a posting queue. Pick only tools you would defend in public.
${warningBlock}
## Supply Plan

${renderSupplyPlan(model.supplyPlan)}

## Source Quality Queue

${renderSourceQueueSummary(model.sourceQualityQueue)}

## Draft Planner

${renderDraftPlanSummary(model.draftPlan)}

## Content Calendar

${renderContentCalendarSummary(model.contentCalendar)}

## Promotion Review Queue

${renderPromotionReviewSummary(model.promotionReview)}

## Today's Top Picks

${renderTopPicks(model.picked)}

## Freshness Diagnostic

${renderFreshnessDiagnostic(model.freshnessReport)}

## Today's Action List

${renderActionList(model.actionList)}

## Account Routing

${renderAccountRouting(model.accountStrategy)}

## Tool Cards

${model.picked.map(renderToolCard).join("\n\n")}

## Skipped / Low Priority Tools

${renderLowPriority(model.lowPriority)}

## Affiliate Research Queue

${renderAffiliateQueue(model.affiliateQueue)}

## Historical Notes

- History records before this run: ${model.historySummary.totalRecords}
- Unique tools seen: ${model.historySummary.uniqueTools}
- Last history date before this run: ${model.historySummary.lastDate ?? "none"}
- Seen-before tools in today's picks: ${seenCount}
- Records written by this run: ${model.picked.length}
`;
}

function renderTopPicks(items) {
  if (!items.length) return "No picks generated.";

  return items.slice(0, 5).map((item, index) => {
    const marker = item.seenBefore ? " Seen before." : "";
    return `${index + 1}. ${item.tool.name} — ${item.score} points — ${item.followUpAction}.${marker}`;
  }).join("\n");
}

function renderSupplyPlan(supplyPlan) {
  if (!supplyPlan) return "No supply plan available.";
  const accountShortages = (supplyPlan.accountCoverage ?? [])
    .filter((account) => account.gap > 0)
    .slice(0, 8)
    .map((account) => `- ${account.displayName}: ${account.availableDrafts}/${account.targetPosts} unique candidates, gap ${account.gap}`)
    .join("\n");
  const circles = (supplyPlan.circleCoverage ?? [])
    .map((circle) => `- ${circle.name}: ${circle.qualifiedTools} qualified items, up to ${circle.possibleDrafts} draft variants`)
    .join("\n");

  return [
    `- Target: ${supplyPlan.targetAccounts} accounts x ${supplyPlan.targetPerAccount} posts = ${supplyPlan.targetDrafts} drafts/day`,
    `- Quality floor: score ${supplyPlan.minimumQualityScore}+ and not skip`,
    `- Qualified unique items: ${supplyPlan.qualifiedTools}`,
    `- Possible non-identical draft variants: ${supplyPlan.possibleDrafts}`,
    `- Gap: ${supplyPlan.totalGap}`,
    `- Status: ${supplyPlan.status}`,
    `- Note: ${supplyPlan.note}`,
    "",
    "Circle coverage:",
    circles || "- No circle coverage yet.",
    "",
    "Account shortages:",
    accountShortages || "- No account shortage under the current target."
  ].join("\n");
}

function renderSourceQueueSummary(queue) {
  if (!queue?.items?.length) return "No source quality gaps detected.";
  return [
    `- Queue items: ${queue.summary.items}`,
    `- Needed candidates: ${queue.summary.totalNeededCandidates}`,
    `- Top gap: ${queue.summary.topCircle || "none"}`,
    "",
    ...queue.items.slice(0, 5).map((item, index) => {
      return `${index + 1}. ${item.circleName}: need ${item.neededCandidates}; affected accounts ${item.affectedAccounts.length}; try ${item.searchQueries[0] ?? "manual research"}`;
    })
  ].join("\n");
}

function renderDraftPlanSummary(plan) {
  if (!plan) return "No draft plan available.";
  const gaps = (plan.accountPlans ?? [])
    .filter((account) => account.gap > 0)
    .slice(0, 8)
    .map((account) => `- ${account.displayName}: ${account.plannedPosts}/${account.targetPosts}, gap ${account.gap}`)
    .join("\n");
  return [
    `- Rule: ${plan.rule}`,
    `- Planned posts: ${plan.summary.plannedPosts}/${plan.summary.targetPosts}`,
    `- Gap: ${plan.summary.gap}`,
    `- Unique tools used: ${plan.summary.uniqueToolsUsed}`,
    "",
    "Account gaps:",
    gaps || "- No account gaps in this draft plan."
  ].join("\n");
}

function renderContentCalendarSummary(calendar) {
  if (!calendar) return "No content calendar available.";
  const targetIncompatible = (calendar.accountCalendars ?? [])
    .filter((account) => account.status === "target_incompatible")
    .slice(0, 8)
    .map((account) => `- ${account.displayName}: ${account.sameDayCapacity}/${account.targetPosts} slots, cooldown ${account.cooldownHours}h, suggested ${account.recommendedCooldownHours}h`)
    .join("\n");

  return [
    `- Rule: ${calendar.rule}`,
    `- Scheduled posts: ${calendar.summary.scheduledPosts}/${calendar.summary.targetPosts}`,
    `- Same-day capacity: ${calendar.summary.sameDayCapacity}`,
    `- Draft gap: ${calendar.summary.draftGap}`,
    `- Capacity gap: ${calendar.summary.capacityGap}`,
    `- Ready accounts: ${calendar.summary.readyAccounts}/${calendar.summary.accounts}`,
    "",
    "Target/cooldown conflicts:",
    targetIncompatible || "- No target/cooldown conflict detected."
  ].join("\n");
}

function renderPromotionReviewSummary(review) {
  if (!review) return "No promotion review generated.";

  return [
    `- Rule: ${review.rule}`,
    `- Total items: ${review.summary.totalItems}`,
    `- Ready to queue: ${review.summary.readyToQueue}`,
    `- Already queued: ${review.summary.alreadyQueued}`,
    `- Needs feedback: ${review.summary.needsFeedback}`,
    "",
    "Next actions:",
    review.nextActions.length ? review.nextActions.map((item) => `- ${item}`).join("\n") : "- No promotion action yet.",
    "",
    "Top review items:",
    review.items.slice(0, 5).map((item) => `- ${item.toolName}: ${item.reviewStatus} -> ${item.queueType || item.suggestion}, priority ${item.priorityScore}`).join("\n") || "- No review items."
  ].join("\n");
}

function renderActionList(actions) {
  if (!actions.length) return "No clear action today. Better to skip than force weak posts.";

  return actions.map((action, index) => {
    return `${index + 1}. ${action.type}: ${action.detail}`;
  }).join("\n");
}

function renderFreshnessDiagnostic(report) {
  if (!report) return "No freshness report available.";
  const stats = report.stats ?? {};
  const watchlist = report.freshFeedWatchlist?.length
    ? `\n\nFresh feed watchlist:\n${report.freshFeedWatchlist.map((item, index) => {
      const age = item.ageDays === null ? "unknown age" : `${item.ageDays} day${item.ageDays === 1 ? "" : "s"} old`;
      return `${index + 1}. ${item.name} — ${age} — score ${item.score}${item.inTopPicks ? " — in top picks" : ""}`;
    }).join("\n")}`
    : "";

  return [
    `- Feed fresh today: ${stats.freshToday ?? 0}`,
    `- Feed fresh 48h: ${stats.fresh48 ?? 0}`,
    `- Feed fresh 7d: ${stats.fresh7d ?? 0}`,
    `- Older/unknown: ${(stats.older ?? 0) + (stats.unknownPublished ?? 0)}`,
    `- Fresh top-pick candidates: ${stats.topPickFreshPostCandidates ?? 0}`,
    `- Diagnosis: ${report.diagnosis}`,
    `- Recommendation: ${report.recommendation}`
  ].join("\n") + watchlist;
}

function renderAccountRouting(strategy) {
  if (!strategy?.accounts?.length) return "No account profiles configured yet.";
  const recommendations = strategy.toolRecommendations?.length
    ? `\n\nRecommended routing:\n${strategy.toolRecommendations.map((item, index) => `${index + 1}. ${item.toolName} → ${item.primary?.displayName ?? "No account"} (${item.reason})`).join("\n")}`
    : "";
  return [
    `- Mode: ${strategy.mode}`,
    `- Active accounts: ${strategy.summary.activeAccounts}/${strategy.summary.totalAccounts}`,
    `- Auth ready: ${strategy.authReady ? "yes" : "no — planning only"}`,
    `- Same-tool cooldown: ${strategy.sameToolCooldownDays} days`,
    `- Same-copy cooldown: ${strategy.sameCopyCooldownDays} days`
  ].join("\n") + recommendations;
}

function renderScoreBreakdown(scoreBreakdown) {
  return [
    `painScore ${scoreBreakdown.painScore}`,
    `nicheScore ${scoreBreakdown.nicheScore}`,
    `affiliateScore ${scoreBreakdown.affiliateScore}`,
    `contentScore ${scoreBreakdown.contentScore}`,
    `noveltyScore ${scoreBreakdown.noveltyScore}`,
    `riskScore ${scoreBreakdown.riskScore ? `-${scoreBreakdown.riskScore}` : "0"}`,
    `seenPenalty ${scoreBreakdown.seenPenalty ? `-${scoreBreakdown.seenPenalty}` : "0"}`,
    `total ${scoreBreakdown.total}`
  ].join(" | ");
}

function renderToolCard(item) {
  const affiliateStatus = buildAffiliateStatus(item);
  const seenLine = item.seenBefore
    ? `Seen before: yes (${item.historyInfo.count} prior record${item.historyInfo.count === 1 ? "" : "s"}, last ${item.historyInfo.lastSeen})`
    : "Seen before: no";
  const copy = item.copyVariants.map((variant) => {
    return `**${formatVariantLabel(variant.label)}**\n${variant.text}\nCheck: ${summarizeLint(variant.lint)}`;
  }).join("\n\n");

  return `### ${item.tool.name}

- Score breakdown: ${renderScoreBreakdown(item.scoreBreakdown)}
- Follow-up action: ${item.followUpAction}
- Product Hunt: ${item.tool.url}
- Published: ${item.tool.published ?? "unknown"}
- Tagline: ${item.tool.tagline || "none"}
- ${seenLine}
- Reason: ${item.reason}
- Recommended account: ${item.accountRecommendation?.primary?.displayName ?? "No account profile"}${item.accountRecommendation?.reason ? ` — ${item.accountRecommendation.reason}` : ""}
- Affiliate status: ${affiliateStatus.text}
- Suggested angle: ${item.angle.audience} want ${item.angle.outcome}; test whether it solves ${item.angle.pain}.

#### X Copy Variants

${copy}`;
}

function formatVariantLabel(label) {
  const labels = {
    shortPost: "short post",
    casualPost: "casual post",
    contrarianAngle: "contrarian angle",
    painPointHook: "pain-point hook",
    threadOpening: "thread opening"
  };

  return labels[label] ?? label;
}

function renderLowPriority(items) {
  if (!items.length) return "No low-priority tools found in this feed.";

  return items.map((item) => {
    const seen = item.seenBefore ? " Seen before." : "";
    return `- ${item.tool.name}: ${item.score} points, ${item.followUpAction}.${seen} Reason: ${item.reason}`;
  }).join("\n");
}

function renderAffiliateQueue(items) {
  if (!items.length) return "No high-affiliate-score tools without a configured affiliate link today.";

  return items.map((item, index) => {
    return `${index + 1}. ${item.tool.name} — affiliateScore ${item.scoreBreakdown.affiliateScore}, total ${item.score}. No affiliate link yet — research needed. ${item.tool.url}`;
  }).join("\n");
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
    draftPlan: model.draftPlan,
    contentCalendar: model.contentCalendar,
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
    sourceType: item.tool.sourceType ?? "producthunt",
    sourceName: item.tool.sourceName ?? "Product Hunt",
    sourceUrl: item.tool.sourceUrl ?? null,
    sourceNote: item.tool.sourceNote ?? null,
    circle: item.tool.circle ?? "",
    candidateType: item.tool.candidateType ?? "product",
    score: item.score,
    scoreBreakdown: item.scoreBreakdown,
    reason: item.reason,
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
