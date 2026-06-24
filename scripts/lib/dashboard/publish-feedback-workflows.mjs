import {
  loadAccountPosts,
  loadFeedback,
  loadLatest,
  loadReviewPages,
  loadXAccountsConfig,
  saveReviewPages,
  upsertAccountPostFromFeedback,
  upsertFeedback
} from "../storage/interface.mjs";
import { buildReviewOutline, buildReviewRecord, reviewFilePath } from "../review-outline.mjs";
import { formatTodayPlanMarkdown } from "../formatters.mjs";
import { writeTextAtomic } from "../file-store.mjs";
import { mapFeedbackCsv } from "../csv-feedback.mjs";
import { buildFeedbackOps } from "../feedback-ops.mjs";
import { calculateEngagement } from "../scoring.mjs";
import { getAccountXPublishStatus, getXPublishStatus, publishToX } from "../x-publish.mjs";
import { todayString } from "../ids.mjs";
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

function validateFeedback(body) {
  if (!body.toolName || !body.toolUrl || !body.copyText) {
    throw new Error("toolName, toolUrl and copyText are required");
  }
  return body;
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
