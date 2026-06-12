import { normalizeDomain } from "./ids.mjs";
import { parseCsv } from "./csv-feedback.mjs";

const URL_RE = /https?:\/\/[^\s|,]+/i;

export function parseCandidatePaste(text, defaults = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return { entries: [], errors: ["Paste text is empty."] };

  if (looksLikeCsv(raw)) return parseCandidateCsv(raw, defaults);
  return parseCandidateLines(raw, defaults);
}

function looksLikeCsv(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return false;
  const headers = firstLine.split(",").map((item) => item.trim().toLowerCase());
  return headers.includes("url") || headers.includes("toolurl");
}

function parseCandidateCsv(text, defaults) {
  const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (rows.length < 2) return { entries: [], errors: ["CSV needs a header row and at least one candidate row."] };
  const headers = rows[0].map((header) => normalizeHeader(header));
  const entries = [];
  const errors = [];

  rows.slice(1).forEach((row, index) => {
    const record = {};
    headers.forEach((header, cellIndex) => {
      record[header] = row[cellIndex] ?? "";
    });
    const candidate = normalizeCandidate(record, defaults);
    if (candidate.name && candidate.url) entries.push(candidate);
    else errors.push(`Row ${index + 2}: name and url are required.`);
  });

  return { entries, errors };
}

function parseCandidateLines(text, defaults) {
  const entries = [];
  const errors = [];

  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const url = trimmed.match(URL_RE)?.[0]?.replace(/[)\].,;]+$/, "") ?? "";
    if (!url) {
      errors.push(`Line ${index + 1}: missing URL.`);
      return;
    }
    const withoutUrl = trimmed.replace(url, " ").replace(/\s+/g, " ").trim();
    const parts = withoutUrl
      .split(/\||\t+|\s+-\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const candidate = normalizeCandidate({
      name: parts[0] || nameFromUrl(url),
      url,
      tagline: parts[1] || "",
      description: parts.slice(1).join(" "),
      source: defaults.source || "paste",
      notes: trimmed
    }, defaults);
    entries.push(candidate);
  });

  return { entries, errors };
}

function normalizeHeader(value) {
  const header = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return {
    toolname: "name",
    name: "name",
    toolurl: "url",
    url: "url",
    tagline: "tagline",
    description: "description",
    source: "source",
    sourceurl: "sourceUrl",
    circle: "circle",
    candidatetype: "candidateType",
    type: "candidateType",
    published: "published",
    notes: "notes"
  }[header] ?? header;
}

function normalizeCandidate(input, defaults) {
  const url = String(input.url ?? "").trim();
  const text = [
    input.name,
    input.tagline,
    input.description,
    input.notes,
    url
  ].filter(Boolean).join(" ");
  const circle = String(input.circle || defaults.circle || inferCandidateCircle(text) || "").trim();
  return {
    name: String(input.name || nameFromUrl(url)).trim(),
    url,
    tagline: String(input.tagline ?? "").trim(),
    description: String(input.description || input.tagline || "").trim(),
    source: String(input.source || defaults.source || "paste").trim(),
    sourceUrl: String(input.sourceUrl || defaults.sourceUrl || "").trim(),
    circle,
    candidateType: String(input.candidateType || defaults.candidateType || "product").trim(),
    published: input.published || defaults.published || new Date().toISOString(),
    notes: String(input.notes || defaults.notes || "").trim(),
    status: "active"
  };
}

export function inferCandidateCircle(text) {
  const lower = String(text ?? "").toLowerCase();
  const rules = [
    {
      circle: "crypto_builders",
      terms: ["crypto", "web3", "wallet", "onchain", "defi", "stablecoin", "token", "ethereum", "solana", "bitcoin"]
    },
    {
      circle: "saas_founders",
      terms: ["saas", "b2b", "pricing", "churn", "onboarding", "plg", "activation", "retention", "trial"]
    },
    {
      circle: "indie_hackers",
      terms: ["indie", "solo founder", "micro saas", "build in public", "side project", "maker", "revenue"]
    },
    {
      circle: "ai_startups",
      terms: ["ai", "agent", "llm", "automation", "workflow", "assistant", "model", "prompt"]
    }
  ];
  return rules.find((rule) => rule.terms.some((term) => lower.includes(term)))?.circle ?? "";
}

function nameFromUrl(url) {
  const domain = normalizeDomain(url);
  if (!domain) return "";
  return domain
    .split(".")[0]
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
