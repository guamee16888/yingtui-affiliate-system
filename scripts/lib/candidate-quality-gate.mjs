const AUDIENCE_TERMS = [
  "founder", "builder", "developer", "team", "sales", "support", "creator", "marketer", "operator",
  "agency", "shopify", "ecommerce", "saas", "indie", "startup", "crypto", "trader", "writer"
];
const PAIN_TERMS = [
  "pain", "problem", "fix", "reduce", "save", "automate", "workflow", "manual", "churn", "pricing",
  "conversion", "support", "lead", "reporting", "analytics", "risk", "alert", "debug", "research"
];
const BROAD_TERMS = [
  "all-in-one", "everything", "ultimate", "best ai", "make money", "passive income", "10x", "viral",
  "revolutionary", "game changer", "everyone", "anyone"
];
const PLACEHOLDER_TERMS = ["example.com", "your-url", "placeholder", "todo", "lorem ipsum"];
const MARKET_ONLY_TERMS = ["price", "etf", "token", "trading", "market", "outflows", "valuation", "rumored"];
const BUILDER_TERMS = ["api", "sdk", "tool", "builder", "developer", "wallet", "protocol", "dashboard", "workflow", "product"];

export function evaluateCandidateQualityGate(candidate, { date = "" } = {}) {
  const text = candidateText(candidate);
  const lower = text.toLowerCase();
  const angleLower = candidateAngleText(candidate).toLowerCase();
  const reasons = [];
  const fixes = [];
  const tags = [];
  let score = 100;
  let hardBlock = false;

  if (!validHttpUrl(candidate.url)) {
    hardBlock = true;
    score = 0;
    reasons.push("URL is missing or invalid.");
    fixes.push("Add a real http/https URL.");
    tags.push("bad_url");
  }

  if (PLACEHOLDER_TERMS.some((term) => lower.includes(term))) {
    hardBlock = true;
    score = Math.min(score, 20);
    reasons.push("Looks like a placeholder row, not a real candidate.");
    fixes.push("Replace placeholders with a real name, URL, and narrow tagline.");
    tags.push("placeholder");
  }

  const detailText = `${candidate.tagline ?? ""} ${candidate.description ?? ""} ${candidate.notes ?? ""}`.trim();
  if (detailText.length < 24) {
    score -= 18;
    reasons.push("Tagline or notes are too thin to judge the angle.");
    fixes.push("Add one sentence: who has the pain, what changed, and why it matters.");
    tags.push("thin_context");
  }

  if (!hasAny(lower, AUDIENCE_TERMS)) {
    score -= 14;
    reasons.push("No clear audience is visible.");
    fixes.push("Name the audience, such as founders, SaaS teams, indie builders, crypto developers, or creators.");
    tags.push("unclear_audience");
  }

  if (!hasAny(lower, PAIN_TERMS)) {
    score -= 16;
    reasons.push("No narrow pain or workflow is visible.");
    fixes.push("Rewrite the tagline around one repeated pain, workflow, or before/after angle.");
    tags.push("unclear_pain");
  }

  const broadMatches = BROAD_TERMS.filter((term) => lower.includes(term));
  if (broadMatches.length) {
    score -= Math.min(24, broadMatches.length * 12);
    reasons.push(`Broad hype wording: ${broadMatches.slice(0, 3).join(", ")}.`);
    fixes.push("Replace broad claims with a specific buyer, task, and constraint.");
    tags.push("too_broad");
  }

  const ageDays = candidateAgeDays(candidate.published, date);
  if (ageDays !== null) {
    if (candidate.candidateType === "topic" && ageDays > 7) {
      score -= 16;
      reasons.push(`Topic is ${ageDays} days old, so it may be stale for X posting.`);
      fixes.push("Only keep it if it is evergreen enough for a thread or review page.");
      tags.push("stale_topic");
    } else if (candidate.candidateType !== "topic" && ageDays > 45) {
      score -= 10;
      reasons.push(`Candidate is ${ageDays} days old; freshness is weak.`);
      fixes.push("Verify it still exists, has recent traction, or has an evergreen search angle.");
      tags.push("older_candidate");
    }
  }

  if (candidate.circle === "crypto_builders" && hasAny(angleLower, MARKET_ONLY_TERMS) && !hasAny(angleLower, BUILDER_TERMS)) {
    score -= 18;
    reasons.push("Crypto angle looks market-only, not builder/tool oriented.");
    fixes.push("Add a builder, infrastructure, wallet, API, or risk workflow angle before importing.");
    tags.push("market_only_crypto");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const severeWeakness = tags.includes("thin_context") && tags.includes("unclear_audience") && tags.includes("unclear_pain");
  const status = hardBlock || severeWeakness || score < 45
    ? "skip"
    : score < 75 || tags.length
      ? "review"
      : "import";

  return {
    status,
    score,
    reasons,
    fixes,
    tags
  };
}

function candidateText(candidate) {
  return [
    candidate.name,
    candidate.url,
    candidate.tagline,
    candidate.description,
    candidate.source,
    candidate.circle,
    candidate.candidateType,
    candidate.notes
  ].filter(Boolean).join(" ");
}

function candidateAngleText(candidate) {
  return [
    candidate.name,
    candidate.url,
    candidate.tagline,
    candidate.description,
    candidate.source,
    candidate.candidateType,
    candidate.notes
  ].filter(Boolean).join(" ");
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function candidateAgeDays(published, date) {
  if (!published || !date) return null;
  const publishedDate = new Date(published);
  const currentDate = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(publishedDate.getTime()) || Number.isNaN(currentDate.getTime())) return null;
  return Math.max(0, Math.floor((currentDate.getTime() - publishedDate.getTime()) / 86400000));
}
