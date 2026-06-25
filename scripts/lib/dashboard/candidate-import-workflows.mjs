import {
  loadAffiliateLinks,
  loadCandidateInbox,
  loadHistoryData,
  loadLatest,
  upsertCandidate
} from "../storage/interface.mjs";
import { readJson } from "../file-store.mjs";
import { parseCandidatePaste } from "../candidate-parser.mjs";
import { evaluateCandidateQualityGate } from "../candidate-quality-gate.mjs";
import { buildHistoryIndex, candidateInboxToTools, scoreTool } from "../affiliate-system.mjs";
import { buildSeedImportNextActions, buildSeedImportReadiness } from "../seed-batch-pack.mjs";
import { buildAccountRefillImpact } from "../account-refill-impact.mjs";
import { createToolId, todayString } from "../ids.mjs";

export async function importCandidatePaste(body) {
  const plan = await buildCandidatePastePlan(body);
  const importMode = body.importMode === "all" ? "all" : "recommended";
  const candidates = plan.previews
    .filter((item) => importMode === "all" ? item.importDecision !== "skip" : item.importEligible)
    .map((item) => item.candidate);
  const entries = [];
  for (const candidate of candidates) {
    entries.push(await upsertCandidate(candidate));
  }
  return {
    imported: entries.length,
    skipped: plan.previews.length - entries.length,
    importMode,
    entries,
    errors: plan.errors,
    summary: plan.summary,
    seedImportReadiness: plan.seedImportReadiness,
    accountRefillImpact: plan.accountRefillImpact,
    nextActions: buildSeedImportNextActions({
      imported: entries.length,
      skipped: plan.previews.length - entries.length,
      errors: plan.errors,
      importMode,
      seedImportReadiness: plan.seedImportReadiness
    })
  };
}

export function previewCandidatePaste(body) {
  return buildCandidatePastePlan(body);
}

export function validateCandidate(body) {
  if (!body.name || !body.url) throw new Error("name and url are required");
  try {
    new URL(body.url);
  } catch {
    throw new Error("candidate url must be a valid URL");
  }
  return body;
}

async function buildCandidatePastePlan(body) {
  if (!body.text || typeof body.text !== "string") throw new Error("paste text is required");
  const date = body.date || (await loadLatest())?.date || todayString();
  const parsed = parseCandidatePaste(body.text, {
    source: body.source || "paste",
    sourceUrl: body.sourceUrl || "",
    circle: body.circle || "",
    candidateType: body.candidateType || "product",
    published: body.published || new Date().toISOString()
  });
  if (!parsed.entries.length) {
    throw new Error(parsed.errors.join(" ") || "No valid candidate rows found.");
  }
  if (parsed.entries.length > 100) throw new Error("Candidate paste preview is limited to 100 rows at a time");

  const [history, affiliateConfig, candidateInbox, latest, seedBatchPack, accountRefillWorkbench] = await Promise.all([
    loadHistoryData(),
    loadAffiliateLinks(),
    loadCandidateInbox(),
    loadLatest(),
    readJson("data/seed-batch-pack.json", null),
    readJson("data/account-refill-workbench.json", null)
  ]);
  const context = {
    date,
    historyIndex: buildHistoryIndex(history, { beforeDate: date }),
    affiliateConfig
  };
  const tools = candidateInboxToTools({ items: parsed.entries }, date);
  const duplicateContext = buildCandidateDuplicateContext({ candidateInbox, latest });
  const seenInPaste = new Set();
  const previews = tools
    .map((tool, index) => {
      const scored = scoreTool(tool, context);
      const candidate = parsed.entries[index];
      const toolId = createToolId(candidate.name, candidate.url);
      const duplicate = candidateDuplicateStatus({ toolId, url: candidate.url, seenInPaste, duplicateContext });
      return candidatePreviewJson(scored, candidate, duplicate, date);
    })
    .sort((a, b) => Number(b.score) - Number(a.score));

  return {
    date,
    parsed: parsed.entries.length,
    summary: {
      parsed: parsed.entries.length,
      importable: previews.filter((item) => item.importEligible).length,
      review: previews.filter((item) => item.importDecision === "review").length,
      skipped: previews.filter((item) => item.importDecision === "skip").length,
      duplicates: previews.filter((item) => item.duplicate).length
    },
    seedImportReadiness: buildSeedImportReadiness({ seedBatchPack, previews }),
    accountRefillImpact: buildAccountRefillImpact({
      accountRefillWorkbench,
      previews,
      importMode: body.importMode === "all" ? "all" : "recommended"
    }),
    previews,
    errors: parsed.errors
  };
}

function buildCandidateDuplicateContext({ candidateInbox, latest }) {
  const current = new Set((candidateInbox.items ?? []).map((item) => item.toolId || createToolId(item.name, item.url)));
  const currentUrls = new Set((candidateInbox.items ?? []).map((item) => normalizedUrlKey(item.url)).filter(Boolean));
  const latestTools = new Set([...(latest?.tools ?? []), ...(latest?.skippedTools ?? [])].map((item) => item.toolId || createToolId(item.name, item.url)));
  const latestUrls = new Set([...(latest?.tools ?? []), ...(latest?.skippedTools ?? [])].map((item) => normalizedUrlKey(item.url)).filter(Boolean));
  return { current, currentUrls, latestTools, latestUrls };
}

function candidateDuplicateStatus({ toolId, url, seenInPaste, duplicateContext }) {
  const urlKey = normalizedUrlKey(url);
  const pasteKeys = [toolId, urlKey ? `url:${urlKey}` : ""].filter(Boolean);
  if (pasteKeys.some((key) => seenInPaste.has(key))) return { duplicate: true, duplicateStatus: "duplicate_in_paste", duplicateReason: "Duplicate inside this paste." };
  for (const key of pasteKeys) seenInPaste.add(key);
  if (duplicateContext.current.has(toolId) || duplicateContext.currentUrls.has(urlKey)) return { duplicate: true, duplicateStatus: "already_in_candidate_inbox", duplicateReason: "Already exists in candidate inbox." };
  if (duplicateContext.latestTools.has(toolId) || duplicateContext.latestUrls.has(urlKey)) return { duplicate: true, duplicateStatus: "already_in_latest_daily", duplicateReason: "Already exists in today's daily data." };
  return { duplicate: false, duplicateStatus: "new_candidate", duplicateReason: "" };
}

function normalizedUrlKey(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
    }
    parsed.hash = "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function candidatePreviewJson(item, candidate, duplicate, date) {
  const qualityGate = evaluateCandidateQualityGate(candidate, { date });
  const importDecision = candidateImportDecision(item, duplicate, qualityGate);
  return {
    candidate,
    name: item.tool.name,
    url: item.tool.url,
    tagline: item.tool.tagline,
    published: item.tool.published ?? null,
    sourceName: item.tool.sourceName ?? "Candidate Inbox",
    circle: item.tool.circle ?? "",
    candidateType: item.tool.candidateType ?? "product",
    accountId: candidate.accountId ?? item.tool.accountId ?? "",
    accountName: candidate.accountName ?? item.tool.accountName ?? "",
    seedId: candidate.seedId ?? item.tool.seedId ?? "",
    score: item.score,
    scoreBreakdown: item.scoreBreakdown,
    followUpAction: item.followUpAction,
    qualityGate,
    importEligible: importDecision === "import",
    importDecision,
    importReason: candidateImportReason(item, duplicate, importDecision, qualityGate),
    seenBefore: item.seenBefore,
    duplicate: duplicate.duplicate,
    duplicateStatus: duplicate.duplicateStatus,
    duplicateReason: duplicate.duplicateReason,
    reason: item.reason,
    affiliateStatus: item.affiliate ? "matched" : "research_needed",
    affiliateLink: item.affiliate?.affiliateUrl ?? null
  };
}

function candidateImportDecision(item, duplicate, qualityGate) {
  if (duplicate.duplicate) return "skip";
  if (qualityGate.status === "skip") return "skip";
  if (Number(item.score) < 14) return "skip";
  if (qualityGate.status === "review") return "review";
  if (item.followUpAction === "skip" || Number(item.score) < 18) return Number(item.score) >= 14 ? "review" : "skip";
  return "import";
}

function candidateImportReason(item, duplicate, decision, qualityGate) {
  if (duplicate.duplicate) return duplicate.duplicateReason;
  if (qualityGate.status === "skip") return `Quality gate blocked it: ${qualityGate.reasons[0] ?? "needs stronger source detail"}`;
  if (qualityGate.status === "review") return `Quality gate asks for review: ${qualityGate.reasons[0] ?? "needs manual check"}`;
  if (decision === "import") return "Meets quality floor and is not a duplicate.";
  if (decision === "review") return "Borderline score. Keep for manual review before importing.";
  return item.followUpAction === "skip" ? "Scoring says skip." : "Below quality floor.";
}
