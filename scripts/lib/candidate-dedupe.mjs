import { createStableId, slugify } from "./ids.mjs";
import { normalizeText } from "./text-normalizer.mjs";
import { normalizeDomain, normalizeUrl } from "./url-utils.mjs";

export function createCandidateId(candidate) {
  const url = normalizeUrl(candidate.url);
  const title = normalizeTitle(candidate.title || candidate.name);
  return candidate.candidateId || createStableId("candidate", [url || slugify(title), title]);
}

export function checkCandidateDuplicate(candidate, existingCandidates = []) {
  const url = normalizeUrl(candidate.url);
  const title = normalizeTitle(candidate.title || candidate.name);
  const domain = normalizeDomain(candidate.url);
  const flags = [];
  let action = "allow";

  if (!title) flags.push(warn("missing_title", "Candidate is missing a title."));
  if (!candidate.summary && !candidate.rawText) flags.push(warn("missing_summary", "Candidate is missing a summary or raw text."));

  for (const existing of existingCandidates) {
    const existingUrl = normalizeUrl(existing.url);
    const existingTitle = normalizeTitle(existing.title || existing.name);
    if (url && existingUrl && url === existingUrl) {
      flags.push(block("duplicate_url", `Same normalized URL already exists: ${existing.candidateId || existing.title || existing.url}`));
      action = "block";
      continue;
    }
    if (title && existingTitle && title === existingTitle) {
      flags.push(block("duplicate_title", `Same normalized title already exists: ${existing.candidateId || existing.title || existing.url}`));
      action = "block";
      continue;
    }
    const existingDomain = normalizeDomain(existing.url);
    if (domain && existingDomain && domain === existingDomain && titleSimilarity(title, existingTitle) >= 0.7) {
      flags.push(warn("same_domain_similar_title", `Same domain with similar title: ${existing.candidateId || existing.title || existing.url}`));
    }
  }

  return {
    ok: action !== "block",
    action,
    riskLevel: action === "block" ? "block" : flags.length ? "medium" : "low",
    flags
  };
}

export function normalizeTitle(title) {
  return normalizeText(title)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function block(type, message) {
  return { type, severity: "block", message };
}

function warn(type, message) {
  return { type, severity: "warn", message };
}
