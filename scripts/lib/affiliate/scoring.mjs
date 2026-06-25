import { affiliateLinkMatchesTool } from "../affiliate-links.mjs";

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

const mediaSourceHints = [
  "techcrunch",
  "coindesk",
  "the block",
  "decrypt",
  "the verge",
  "wired",
  "bloomberg",
  "reuters",
  "forbes",
  "business insider",
  "cnbc"
];

const lowOriginalityNewsKeywords = [
  "rumor",
  "rumour",
  "rumored",
  "rumoured",
  "reportedly",
  "funding",
  "fundraise",
  "fundraising",
  "raises",
  "raised",
  "raising",
  "valuation",
  "valued at",
  "billion",
  "million",
  "series a",
  "series b",
  "series c",
  "ipo",
  "acquisition"
];

const actionableTopicKeywords = [
  "tool",
  "tools",
  "product",
  "launch",
  "workflow",
  "api",
  "sdk",
  "github",
  "open source",
  "developer",
  "builder",
  "founder",
  "operator",
  "pricing",
  "benchmark",
  "integration",
  "template",
  "dashboard",
  "automation",
  "customer",
  "sales",
  "wallet",
  "onchain"
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

export function daysSince(dateText, todayText) {
  if (!dateText) return null;
  const published = new Date(dateText);
  const today = new Date(`${todayText}T00:00:00+08:00`);
  if (Number.isNaN(published.getTime())) return null;
  return Math.max(0, Math.round((today.getTime() - published.getTime()) / 86400000));
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

export function toolKey(toolOrRecord) {
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
    : shortenPhrase(description, 90);

  return shortDescription
    .toLowerCase()
    .replace(/\bai\b/g, "AI")
    .replace(/\bapi\b/g, "API")
    .replace(/\bseo\b/g, "SEO")
    .replace(/\bshopify\b/g, "Shopify")
    .replace(/\bchrome\b/g, "Chrome")
    .replace(/\bgsuite\b/g, "Google Workspace");
}

function shortenPhrase(text, max) {
  const base = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, Math.max(0, max - 3)).trimEnd();
  const lastSpace = base.lastIndexOf(" ");
  let phrase = lastSpace >= 32 ? base.slice(0, lastSpace) : base;
  phrase = phrase
    .replace(/\b(and|or|but|with|for|to|that|of|the|a|an)$/i, "")
    .replace(/[.,;:!?-]+$/g, "")
    .trim();
  return `${phrase}...`;
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
  return affiliateConfig.links.find((item) => affiliateLinkMatchesTool(tool, item));
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
  const sourceNoisePenalty = tool.sourceQuality?.isNoisy ? 5 : 0;
  const editorialSignals = assessEditorialSignals(tool);
  const originalityPenalty = editorialSignals.penalty;

  const painScore = clamp((painMatches * 2) + (descriptionLength >= 45 ? 2 : 0) + (angle.pain ? 2 : 0));
  const nicheScore = clamp((nicheMatches * 2) + (chooseFromMap(text, audienceMap, "") ? 3 : 0) + (titleWords >= 2 ? 1 : 0));
  const affiliateScore = clamp((affiliateMatches * 2) + (affiliate ? 3 : 0) + (hasMatch(text, ["team", "store", "sales", "customer", "email"]) ? 2 : 0));
  const contentScore = clamp((contentMatches * 2) + (painScore >= 6 ? 2 : 0) + (nicheScore >= 6 ? 2 : 0) + (descriptionLength <= 120 ? 1 : 0));
  const noveltyScore = clamp(publishedNovelty(tool, context.date) + (titleWords >= 2 ? 2 : 0) + (hasMatch(text, ["new", "launch", "2.0", "beta"]) ? 1 : 0));
  const riskScore = clamp((broadMatches * 2) + hotMatches + (bigBrandMatches * 2) + (nicheScore <= 3 ? 2 : 0) + (painScore <= 3 ? 2 : 0) + sourceNoisePenalty + originalityPenalty);
  const seenPenalty = seenBefore ? (historyInfo.lastSeen === context.date ? 6 : 4) : 0;
  const learningBoost = feedbackLearningBoost(tool, context.feedbackLearningSignals);
  const score = painScore + nicheScore + affiliateScore + contentScore + noveltyScore + learningBoost.score - riskScore - seenPenalty;

  const scoreBreakdown = {
    painScore,
    nicheScore,
    affiliateScore,
    contentScore,
    noveltyScore,
    learningScore: learningBoost.score,
    riskScore,
    sourceNoisePenalty,
    originalityPenalty,
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
    editorialSignals,
    followUpAction,
    recommendedToFollow,
    reason: buildReason(scoreBreakdown, angle, affiliate, seenBefore, followUpAction, tool.sourceQuality, learningBoost, editorialSignals)
  };
}

function assessEditorialSignals(tool) {
  const editorialText = normalizeText([
    tool.name,
    tool.description,
    tool.tagline
  ].filter(Boolean).join(" "));
  const sourceText = normalizeText([
    tool.sourceName,
    tool.sourceType,
    tool.sourceUrl,
    tool.url
  ].filter(Boolean).join(" "));
  const newsTerms = lowOriginalityNewsKeywords.filter((term) => editorialText.includes(term));
  const actionTerms = actionableTopicKeywords.filter((term) => editorialText.includes(term));
  const mediaSource = mediaSourceHints.some((hint) => sourceText.includes(hint));
  const isTopic = tool.candidateType === "topic" || tool.sourceType === "source_feed";
  const hasFundingPattern = newsTerms.length >= 2 || /[$€£]\s?\d/.test(editorialText);
  const mediaTopicWithoutAction = Boolean(isTopic && mediaSource && actionTerms.length < 2);
  const lowOriginalityNews = Boolean(
    mediaTopicWithoutAction
    || (isTopic && (mediaSource || hasFundingPattern) && hasFundingPattern && actionTerms.length < 2)
  );
  const needsAngle = Boolean(isTopic && hasFundingPattern && actionTerms.length < 2);
  const status = lowOriginalityNews ? "low_originality_news" : needsAngle ? "needs_original_angle" : "ok";
  const penalty = lowOriginalityNews ? 8 : needsAngle ? 4 : 0;

  return {
    status,
    lowOriginalityNews,
    penalty,
    mediaSource,
    mediaTopicWithoutAction,
    newsTerms: newsTerms.slice(0, 6),
    actionTerms: actionTerms.slice(0, 6),
    reason: lowOriginalityNews
      ? "Fresh as news, but lacks a clear builder, workflow, or operator action for direct posting."
      : needsAngle
        ? "Needs a stronger builder, workflow, or operator angle before posting."
        : "No low-originality news risk detected."
  };
}

function feedbackLearningBoost(tool, signals = null) {
  if (!signals || !["early_learning", "guiding_tomorrow"].includes(signals.status)) {
    return { score: 0, reasons: [] };
  }

  const hints = signals.scoringHints ?? {};
  const reasons = [];
  let score = 0;
  if (tool.accountId && (hints.accountIds ?? []).includes(tool.accountId)) {
    score += 2;
    reasons.push(`matched learned account ${tool.accountName || tool.accountId}`);
  }
  if (tool.sourceId && (hints.sourceIds ?? []).includes(tool.sourceId)) {
    score += 2;
    reasons.push(`matched learned source ${tool.sourceName || tool.sourceId}`);
  } else if (tool.sourceName && (hints.sourceNames ?? []).includes(tool.sourceName)) {
    score += 2;
    reasons.push(`matched learned source ${tool.sourceName}`);
  }
  if (tool.circle && (hints.circles ?? []).includes(tool.circle)) {
    score += 1;
    reasons.push(`matched learned circle ${tool.circle}`);
  }

  return {
    score: Math.min(Number(hints.maxBoostPerTool ?? 3), score),
    reasons
  };
}

function chooseFollowUpAction(scoreBreakdown, affiliate) {
  const { total, painScore, nicheScore, affiliateScore, contentScore, riskScore, sourceNoisePenalty } = scoreBreakdown;

  if (sourceNoisePenalty > 0) return "skip";
  if (total < 18 || riskScore >= 8) return "skip";
  if (!affiliate && affiliateScore >= 8 && painScore >= 6 && nicheScore >= 5) return "affiliate priority";
  if (contentScore >= 8 && affiliateScore >= 6 && painScore >= 6) return "review page candidate";
  if (contentScore >= 7 && painScore >= 6) return "thread candidate";
  return "tweet only";
}

function buildReason(scoreBreakdown, angle, affiliate, seenBefore, action, sourceQuality = null, learningBoost = { score: 0, reasons: [] }, editorialSignals = null) {
  const strengths = [];
  const cautions = [];

  if (scoreBreakdown.painScore >= 7) strengths.push(`clear pain: ${angle.pain}`);
  if (scoreBreakdown.nicheScore >= 7) strengths.push(`specific buyer: ${angle.audience}`);
  if (scoreBreakdown.affiliateScore >= 7) strengths.push("paid-tool or subscription intent looks plausible");
  if (scoreBreakdown.contentScore >= 7) strengths.push("easy before/after/price/alternative content angle");
  if (scoreBreakdown.noveltyScore >= 6) strengths.push("fresh enough to test now");
  if (affiliate) strengths.push("affiliate link already configured");
  if (learningBoost.score > 0) strengths.push(`feedback learning boost: ${learningBoost.reasons.join(", ")}`);

  if (scoreBreakdown.riskScore >= 6) cautions.push("broad or crowded angle risk");
  if (sourceQuality?.isNoisy) cautions.push(sourceQuality.reason);
  if (editorialSignals?.lowOriginalityNews) cautions.push(editorialSignals.reason);
  else if (editorialSignals?.status === "needs_original_angle") cautions.push(editorialSignals.reason);
  if (seenBefore) cautions.push("Seen before, so it is downgraded today");
  if (action === "skip") cautions.push("not enough signal for follow-up");

  if (strengths.length === 0) strengths.push("has at least one narrow workflow angle");

  return `${strengths.join("; ")}.${cautions.length ? ` Caution: ${cautions.join("; ")}.` : ""}`;
}
