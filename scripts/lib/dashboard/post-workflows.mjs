import {
  loadAccountPosts,
  loadCandidateInbox,
  loadAffiliateLinks,
  loadFeedback,
  loadHistoryData,
  loadLatest,
  loadReviewPages,
  loadXAccountsConfig,
  saveReviewPages,
  upsertAccountPostFromFeedback,
  upsertCandidate,
  upsertFeedback
} from "../storage/interface.mjs";
import { buildReviewOutline, buildReviewRecord, reviewFilePath } from "../review-outline.mjs";
import { formatTodayPlanMarkdown } from "../formatters.mjs";
import { readJson, writeTextAtomic } from "../file-store.mjs";
import { mapFeedbackCsv } from "../csv-feedback.mjs";
import { parseCandidatePaste } from "../candidate-parser.mjs";
import { evaluateCandidateQualityGate } from "../candidate-quality-gate.mjs";
import { buildHistoryIndex, candidateInboxToTools, scoreTool } from "../affiliate-system.mjs";
import { buildSeedImportNextActions, buildSeedImportReadiness } from "../seed-batch-pack.mjs";
import { buildAccountRefillImpact } from "../account-refill-impact.mjs";
import { buildFeedbackOps } from "../feedback-ops.mjs";
import { calculateEngagement } from "../scoring.mjs";
import { getAccountXPublishStatus, getXPublishStatus, publishToX } from "../x-publish.mjs";
import { createToolId, todayString } from "../ids.mjs";
import { findAccountById, normalizeAccountConfig, recommendedAccountIdForTool } from "../account-system.mjs";
import { defaultGlobalPublishAccountId } from "./api-get-routes.mjs";

export async function upsertFeedbackWithAccount(body) {
  const latest = await loadLatest();
  const accountConfig = normalizeAccountConfig(await loadXAccountsConfig());
  const feedback = await loadFeedback();
  const accountPosts = await loadAccountPosts();
  const payload = withResolvedAccount(validateFeedback(body), latest, accountConfig);
  const safety = buildPostingSafety({
    payload,
    accountConfig,
    accountPosts,
    feedback,
    excludeFeedbackId: payload.id
  });
  if (safety.blockReasons.length) throw new Error(safety.blockReasons[0]);
  const entry = await upsertFeedback(payload);
  await upsertAccountPostFromFeedback(entry);
  return entry;
}

export async function publishXPost(body) {
  const latest = await loadLatest();
  const accountConfig = normalizeAccountConfig(await loadXAccountsConfig());
  const feedback = await loadFeedback();
  const accountPosts = await loadAccountPosts();
  const payload = withResolvedAccount(validateFeedback({
    ...body,
    copyText: body.text
  }), latest, accountConfig);
  const feedbackOps = buildFeedbackOps({
    date: latest?.date ?? todayString(),
    latest,
    feedback,
    accountPosts,
    accountConfig
  });
  const publishGate = feedbackOps.debtGate;
  if (feedbackGateBlocksPublishing(publishGate)) {
    throw new Error(`${publishGate.title}: ${publishGate.headline}`);
  }
  const safety = buildPostingSafety({ payload, accountConfig, accountPosts, feedback });
  if (safety.blockReasons.length) throw new Error(safety.blockReasons[0]);
  const accountAuth = getAccountXPublishStatus(payload.accountId);
  const globalFallbackAccountId = getXPublishStatus().publishReady ? defaultGlobalPublishAccountId(accountConfig) : "";
  const useGlobalTokenFallback = !accountAuth.publishReady && payload.accountId === globalFallbackAccountId;
  if (!accountAuth.publishReady && !useGlobalTokenFallback) {
    throw new Error(`X token is missing for account ${payload.accountId}. Run npm run x:auth -- --account ${payload.accountId}, or set X_DEFAULT_ACCOUNT_ID to your current global token account.`);
  }
  const result = await publishToX({
    text: body.text,
    confirmed: body.confirmed,
    accountId: payload.accountId,
    useGlobalTokenFallback
  });
  if (body.toolName && body.toolUrl && body.variantType && body.text) {
    const entry = await upsertFeedback({
      ...payload,
      copyText: body.text,
      posted: true,
      postedUrl: result.url,
      postedAt: new Date().toISOString(),
      metrics: {},
      notes: `Published to X from Dashboard${payload.accountName ? ` via ${payload.accountName}` : ""}`
    });
    await upsertAccountPostFromFeedback(entry);
    return { ...result, feedbackEntry: entry };
  }
  return result;
}

export async function importFeedbackCsv(body) {
  if (!body.csv || typeof body.csv !== "string") throw new Error("csv text is required");
  const latest = await loadLatest();
  const feedback = await loadFeedback();
  const mapped = mapFeedbackCsv(body.csv, { latest, feedback });
  if (!mapped.entries.length) {
    throw new Error(mapped.errors.join(" ") || "No valid feedback rows found.");
  }
  if (mapped.entries.length > 100) throw new Error("CSV import is limited to 100 rows at a time");
  const entries = [];
  for (const entry of mapped.entries) {
    const saved = await upsertFeedback(entry);
    await upsertAccountPostFromFeedback(saved);
    entries.push(saved);
  }
  return { imported: entries.length, entries, errors: mapped.errors };
}

export async function previewFeedbackCsv(body) {
  if (!body.csv || typeof body.csv !== "string") throw new Error("csv text is required");
  const latest = await loadLatest();
  const feedback = await loadFeedback();
  const mapped = mapFeedbackCsv(body.csv, { latest, feedback });
  if (mapped.entries.length > 100) throw new Error("CSV preview is limited to 100 rows at a time");
  return {
    count: mapped.entries.length,
    errors: mapped.errors,
    previews: mapped.entries.map((entry) => {
      const engagement = calculateEngagement(entry.metrics);
      return {
        toolId: entry.toolId,
        toolName: entry.toolName,
        toolUrl: entry.toolUrl,
        sourceDate: entry.sourceDate,
        variantType: entry.variantType,
        accountId: entry.accountId,
        accountName: entry.accountName,
        postedUrl: entry.postedUrl,
        postedAt: entry.postedAt,
        copyText: entry.copyText,
        metrics: entry.metrics,
        matchStatus: entry.matchStatus,
        metricStatus: entry.metricStatus,
        engagementScore: engagement.engagementScore,
        engagementRate: engagement.engagementRate,
        clickRate: engagement.clickRate
      };
    })
  };
}

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

export async function previewCandidatePaste(body) {
  return buildCandidatePastePlan(body);
}

export async function generateReviewOutline(toolName) {
  const [latest, reviewPages] = await Promise.all([loadLatest(), loadReviewPages()]);
  const tool = (latest?.tools ?? []).find((item) => item.name === toolName);
  if (!tool) throw new Error(`Tool not found in latest data: ${toolName}`);
  const filePath = reviewFilePath(tool, latest.date);
  const markdown = buildReviewOutline(tool, tool.affiliateLink);
  await writeTextAtomic(filePath, markdown);
  const record = buildReviewRecord(tool, filePath, tool.affiliateLink);
  const items = reviewPages.items.filter((item) => item.id !== record.id);
  items.push(record);
  await saveReviewPages({ ...reviewPages, items });
  return { filePath, markdown, record };
}

export async function exportTodayPlan() {
  const latest = await loadLatest();
  if (!latest) throw new Error("latest.json missing. Run npm run daily first.");
  const posts = latest.actionList.filter((action) => action.type === "post").slice(0, 3).map((action) => {
    const tool = latest.tools.find((item) => item.name === action.toolName);
    return { toolName: action.toolName, copyText: tool?.copyVariants?.shortPost ?? action.reason };
  });
  const affiliateAction = latest.actionList.find((action) => action.type === "research affiliate");
  const longformAction = latest.actionList.find((action) => action.type === "longform");
  const plan = {
    date: latest.date,
    posts,
    affiliate: affiliateAction ? {
      toolName: affiliateAction.toolName,
      searchQuery: `"${affiliateAction.toolName}" affiliate program`,
      reason: affiliateAction.reason
    } : null,
    longform: longformAction ? {
      toolName: longformAction.toolName,
      reason: longformAction.reason
    } : null
  };
  const markdown = formatTodayPlanMarkdown(plan);
  const filePath = `output/${latest.date}-today-plan.md`;
  await writeTextAtomic(filePath, markdown);
  return { filePath, markdown };
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

export function validateQueue(body) {
  if (!body.toolName || !body.toolUrl || !body.type) {
    throw new Error("toolName, toolUrl and type are required");
  }
  return body;
}

export function validateAffiliateResearch(body) {
  if (!body.toolName || !body.toolUrl) throw new Error("toolName and toolUrl are required");
  return body;
}

function validateFeedback(body) {
  if (!body.toolName || !body.toolUrl || !body.copyText) {
    throw new Error("toolName, toolUrl and copyText are required");
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

function feedbackGateBlocksPublishing(gate) {
  if (!gate) return false;
  return Number(gate.maxNewPostsBeforeMetrics ?? 3) <= 0
    || ["blocked_no_metrics", "feedback_debt_high"].includes(gate.status);
}

function withResolvedAccount(body, latest, accountConfig) {
  const tool = (latest?.tools ?? []).find((item) => item.toolId === body.toolId || item.name === body.toolName) ?? null;
  const accountId = String(body.accountId || recommendedAccountIdForTool(tool) || "").trim();
  const account = accountId ? findAccountById(accountConfig, accountId) : null;
  if (!accountId) throw new Error("Select an X account before saving or publishing.");
  if (!account) throw new Error(`Unknown X account: ${accountId}. Check config/x-accounts.json.`);
  if (!account.active) throw new Error(`${account.displayName} is paused in config/x-accounts.json.`);
  return {
    ...body,
    toolId: body.toolId || tool?.toolId,
    sourceDate: body.sourceDate || latest?.date || todayString(),
    sourceId: body.sourceId || tool?.sourceId || "",
    sourceName: body.sourceName || tool?.sourceName || "",
    sourceType: body.sourceType || tool?.sourceType || "",
    circle: body.circle || tool?.circle || "",
    candidateType: body.candidateType || tool?.candidateType || "",
    accountId: account.id,
    accountName: account.displayName,
    workspaceId: body.workspaceId || account.workspaceId || "workspace_default"
  };
}

function buildPostingSafety({ payload, accountConfig, accountPosts, feedback, excludeFeedbackId = "" }) {
  const account = findAccountById(accountConfig, payload.accountId);
  const policy = accountConfig.rotationPolicy ?? {};
  const now = new Date();
  const posts = combinedPostRecords(accountPosts, feedback)
    .filter((post) => post.feedbackId !== excludeFeedbackId)
    .filter((post) => post.accountId || post.toolId || post.copyText);
  const blockReasons = [];

  if (!account) blockReasons.push(`Unknown X account: ${payload.accountId}.`);
  if (account && postsTodayForAccount(posts, account.id, now) >= account.dailyPostLimit) {
    blockReasons.push(`${account.displayName} reached its daily limit (${account.dailyPostLimit}/day). Pick another account or wait until tomorrow.`);
  }

  const lastAccountPost = latestPostForAccount(posts, payload.accountId);
  const cooldownHours = Number(account?.cooldownHours ?? 0);
  if (lastAccountPost && cooldownHours > 0 && hoursSince(lastAccountPost.postedAt, now) < cooldownHours) {
    blockReasons.push(`${account.displayName} is still in cooldown (${cooldownHours}h). Last post was ${Math.round(hoursSince(lastAccountPost.postedAt, now) * 10) / 10}h ago.`);
  }

  const toolCooldownDays = Number(policy.sameToolCooldownDays ?? 7);
  const sameTool = posts.find((post) => post.toolId && post.toolId === payload.toolId && daysSince(post.postedAt, now) < toolCooldownDays);
  if (sameTool) {
    blockReasons.push(`This tool was already posted by ${sameTool.accountName || sameTool.accountId || "another account"} within ${toolCooldownDays} days.`);
  }

  const copyCooldownDays = Number(policy.sameCopyCooldownDays ?? 30);
  const copy = normalizeCopy(payload.copyText);
  const sameCopy = copy ? posts.find((post) => normalizeCopy(post.copyText) === copy && daysSince(post.postedAt, now) < copyCooldownDays) : null;
  if (sameCopy) {
    blockReasons.push(`This copy was already used by ${sameCopy.accountName || sameCopy.accountId || "another account"} within ${copyCooldownDays} days.`);
  }

  return { blockReasons };
}

function combinedPostRecords(accountPosts, feedback) {
  const records = [...(accountPosts.items ?? [])];
  for (const entry of feedback.entries ?? []) {
    if (entry.posted === false || !entry.accountId) continue;
    records.push({
      feedbackId: entry.id,
      accountId: entry.accountId,
      accountName: entry.accountName,
      toolId: entry.toolId,
      toolName: entry.toolName,
      toolUrl: entry.toolUrl,
      variantType: entry.variantType,
      copyText: entry.copyText,
      postedUrl: entry.postedUrl,
      postedAt: entry.postedAt || entry.updatedAt || entry.createdAt
    });
  }
  return records;
}

function postsTodayForAccount(posts, accountId, now) {
  const today = now.toISOString().slice(0, 10);
  return posts.filter((post) => post.accountId === accountId && String(post.postedAt || "").slice(0, 10) === today).length;
}

function latestPostForAccount(posts, accountId) {
  return posts
    .filter((post) => post.accountId === accountId)
    .sort((a, b) => new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime())[0] ?? null;
}

function daysSince(value, now) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 86400000);
}

function hoursSince(value, now) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 3600000);
}

function normalizeCopy(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
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
