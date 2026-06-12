import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteFeedback,
  loadAccountPosts,
  loadCandidateInbox,
  loadAffiliateLinks,
  loadAffiliateResearch,
  loadFeedback,
  loadHistoryData,
  loadLatest,
  loadQueues,
  loadReviewPages,
  loadVoiceConfig,
  loadXAccountsConfig,
  saveReviewPages,
  upsertAccountPostFromFeedback,
  upsertCandidate,
  upsertAffiliateResearch,
  upsertFeedback,
  upsertQueueItem,
  updateCandidateStatus,
  updateQueueStatus
} from "./lib/data-store.mjs";
import { buildPromotionSuggestions } from "./lib/promotion-engine.mjs";
import { buildReviewOutline, buildReviewRecord, reviewFilePath } from "./lib/review-outline.mjs";
import { formatTodayPlanMarkdown } from "./lib/formatters.mjs";
import { readJson, writeTextAtomic } from "./lib/file-store.mjs";
import { buildWeeklyReport, generateWeeklyReport } from "./lib/weekly-report.mjs";
import { mapFeedbackCsv } from "./lib/csv-feedback.mjs";
import { parseCandidatePaste } from "./lib/candidate-parser.mjs";
import { evaluateCandidateQualityGate } from "./lib/candidate-quality-gate.mjs";
import { buildHistoryIndex, candidateInboxToTools, scoreTool } from "./lib/affiliate-system.mjs";
import { buildSeedImportNextActions, buildSeedImportReadiness } from "./lib/seed-batch-pack.mjs";
import { buildAccountRefillImpact } from "./lib/account-refill-impact.mjs";
import { buildDecisionReport } from "./lib/decision-engine.mjs";
import { buildFeedbackOps, buildLearningLoop } from "./lib/feedback-ops.mjs";
import { calculateEngagement } from "./lib/scoring.mjs";
import { getXPublishStatus, publishToX } from "./lib/x-publish.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { createToolId, todayString } from "./lib/ids.mjs";
import { findAccountById, normalizeAccountConfig, recommendedAccountIdForTool } from "./lib/account-system.mjs";
import { getAccountXPublishStatus } from "./lib/x-publish.mjs";

await loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dashboardDir = path.join(rootDir, "dashboard");
const publicDir = path.join(rootDir, "public");
const allowedRoots = [
  dashboardDir,
  publicDir,
  path.join(rootDir, "data"),
  path.join(rootDir, "output")
];

let dailyRunPromise = null;
let calendarRunPromise = null;
let sourcePackRunPromise = null;
let refillWorkbenchRunPromise = null;
let affiliateWorkbenchRunPromise = null;
let learningLoopRunPromise = null;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"]
]);

function parseArgs(argv) {
  const args = { port: 4173, host: "127.0.0.1" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--port") args.port = Number(argv[++index]);
    if (argv[index] === "--host") args.host = argv[++index];
  }
  return args;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function parseBody(request) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) throw new Error("POST only accepts application/json");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET") {
      const data = await handleApiGet(url.pathname);
      sendJson(response, 200, { ok: true, data });
      return;
    }

    if (request.method === "POST") {
      const body = await parseBody(request);
      const data = await handleApiPost(url.pathname, body);
      sendJson(response, 200, { ok: true, data });
      return;
    }

    sendJson(response, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
  }
}

async function handleApiGet(pathname) {
  if (pathname === "/api/latest") return loadLatest();
  if (pathname === "/api/history") return loadHistoryData();
  if (pathname === "/api/candidate-inbox") return loadCandidateInbox();
  if (pathname === "/api/feedback") return loadFeedback();
  if (pathname === "/api/account-posts") return loadAccountPosts();
  if (pathname === "/api/affiliate-links") return loadAffiliateLinks();
  if (pathname === "/api/queues") return loadQueues();
  if (pathname === "/api/review-pages") return loadReviewPages();
  if (pathname === "/api/affiliate-research") return loadAffiliateResearch();
  if (pathname === "/api/affiliate-research-workbench") return readJson("data/affiliate-research-workbench.json", null);
  if (pathname === "/api/product-roadmap") return readJson("data/product-roadmap.json", null);
  if (pathname === "/api/scale-readiness") return readJson("data/scale-readiness.json", null);
  if (pathname === "/api/scale-ramp-plan") return readJson("data/scale-ramp-plan.json", null);
  if (pathname === "/api/seed-batch-pack") return readJson("data/seed-batch-pack.json", null);
  if (pathname === "/api/account-content-matrix") return readJson("data/account-content-matrix.json", null);
  if (pathname === "/api/account-refill-workbench") return readJson("data/account-refill-workbench.json", null);
  if (pathname === "/api/content-calendar") {
    const latest = await loadLatest();
    return await readJson("data/content-calendar/latest.json", latest?.contentCalendar ?? null);
  }
  if (pathname === "/api/source-import-pack") return readJson("data/source-import-pack/latest.json", null);
  if (pathname === "/api/settings") {
    const [latest, history, voice, affiliateLinks, feedback, queues, reviews, affiliateResearch, candidateInbox, accountPosts] = await Promise.all([
      loadLatest(),
      loadHistoryData(),
      loadVoiceConfig(),
      loadAffiliateLinks(),
      loadFeedback(),
      loadQueues(),
      loadReviewPages(),
      loadAffiliateResearch(),
      loadCandidateInbox(),
      loadAccountPosts()
    ]);
    return {
      latestDate: latest?.date ?? null,
      historyCount: history.tools?.length ?? 0,
      forbiddenWords: voice.style?.avoid ?? [],
      maxTweetCharacters: voice.style?.maxTweetCharacters ?? 260,
      affiliateLinks: affiliateLinks.links ?? [],
      feedbackCount: feedback.entries?.length ?? 0,
      accountPostCount: accountPosts.items?.length ?? 0,
      queueCount: queues.items?.length ?? 0,
      candidateInboxCount: candidateInbox.items?.length ?? 0,
      reviewPageCount: reviews.items?.length ?? 0,
      affiliateResearchCount: affiliateResearch.items?.length ?? 0
    };
  }
  if (pathname === "/api/weekly-summary") {
    const [latest, history, feedback, queues, affiliateLinks, weekly] = await Promise.all([
      loadLatest(),
      loadHistoryData(),
      loadFeedback(),
      loadQueues(),
      loadAffiliateLinks(),
      buildWeeklyReport()
    ]);
    return {
      ...weekly.data,
      latestDate: latest?.date ?? null,
      historyCount: history.tools?.length ?? 0,
      feedbackCount: feedback.entries?.length ?? 0,
      queueCount: queues.items?.length ?? 0,
      suggestions: buildPromotionSuggestions({ latest, history, feedback, affiliateLinks }).slice(0, 10)
    };
  }
  if (pathname === "/api/decision-report") {
    const [latest, history, feedback, queues, affiliateLinks] = await Promise.all([
      loadLatest(),
      loadHistoryData(),
      loadFeedback(),
      loadQueues(),
      loadAffiliateLinks()
    ]);
    return buildDecisionReport({ latest, history, feedback, queues, affiliateLinks });
  }
  if (pathname === "/api/feedback-ops") {
    const [latest, feedback, accountPosts, accountConfig] = await Promise.all([
      loadLatest(),
      loadFeedback(),
      loadAccountPosts(),
      loadXAccountsConfig()
    ]);
    return buildFeedbackOps({
      date: latest?.date ?? todayString(),
      latest,
      feedback,
      accountPosts,
      accountConfig
    });
  }
  if (pathname === "/api/learning-loop") {
    const [latest, feedback, accountPosts, accountConfig] = await Promise.all([
      loadLatest(),
      loadFeedback(),
      loadAccountPosts(),
      loadXAccountsConfig()
    ]);
    const ops = buildFeedbackOps({
      date: latest?.date ?? todayString(),
      latest,
      feedback,
      accountPosts,
      accountConfig
    });
    return {
      version: 1,
      ...buildLearningLoop({ ops })
    };
  }
  if (pathname === "/api/x/status") return xStatusWithAccounts();
  throw new Error(`Unknown API route: ${pathname}`);
}

async function handleApiPost(pathname, body) {
  if (pathname === "/api/feedback/upsert") return upsertFeedbackWithAccount(body);
  if (pathname === "/api/candidate-inbox/upsert") return upsertCandidate(validateCandidate(body));
  if (pathname === "/api/candidate-inbox/preview-paste") return previewCandidatePaste(body);
  if (pathname === "/api/candidate-inbox/import-paste") return importCandidatePaste(body);
  if (pathname === "/api/candidate-inbox/status") return updateCandidateStatus(body.id, body.status);
  if (pathname === "/api/feedback/preview-csv") return previewFeedbackCsv(body);
  if (pathname === "/api/feedback/import-csv") return importFeedbackCsv(body);
  if (pathname === "/api/feedback/delete") return deleteFeedback(body.id);
  if (pathname === "/api/queue/upsert") return upsertQueueItem(validateQueue(body));
  if (pathname === "/api/queue/status") return updateQueueStatus(body.id, body.status);
  if (pathname === "/api/affiliate-research/upsert") return upsertAffiliateResearch(validateAffiliateResearch(body));
  if (pathname === "/api/review-outline/generate") return generateReviewOutline(body.toolName);
  if (pathname === "/api/export/today-plan") return exportTodayPlan();
  if (pathname === "/api/weekly/generate") return generateWeeklyReport();
  if (pathname === "/api/daily/run") return runDailyGeneration();
  if (pathname === "/api/content-calendar/run") return runContentCalendarGeneration();
  if (pathname === "/api/source-import-pack/run") return runSourceImportPackGeneration();
  if (pathname === "/api/account-refill-workbench/run") return runAccountRefillWorkbenchGeneration();
  if (pathname === "/api/affiliate-research-workbench/run") return runAffiliateResearchWorkbenchGeneration();
  if (pathname === "/api/learning-loop/run") return runLearningLoopGeneration();
  if (pathname === "/api/roadmap/generate") return runRoadmapGeneration();
  if (pathname === "/api/x/publish") return publishXPost(body);
  throw new Error(`Unknown API route: ${pathname}`);
}

async function runDailyGeneration() {
  if (dailyRunPromise) throw new Error("Daily refresh is already running. Wait for it to finish.");
  dailyRunPromise = runNodeScript("scripts/generate-daily.mjs", "Daily refresh")
    .finally(() => {
      dailyRunPromise = null;
    });
  const result = await dailyRunPromise;
  const latest = await loadLatest();
  return {
    ...result,
    latestDate: latest?.date ?? null,
    generatedAt: latest?.generatedAt ?? null,
    usedFallback: Boolean(latest?.source?.usedFallback),
    topPicks: latest?.summary?.topPicks ?? 0
  };
}

async function runContentCalendarGeneration() {
  if (calendarRunPromise) throw new Error("Content calendar refresh is already running. Wait for it to finish.");
  calendarRunPromise = runNodeScript("scripts/content-calendar.mjs", "Content calendar refresh")
    .finally(() => {
      calendarRunPromise = null;
    });
  const result = await calendarRunPromise;
  const latest = await loadLatest();
  const calendar = await readJson("data/content-calendar/latest.json", latest?.contentCalendar ?? null);
  return {
    ...result,
    date: calendar?.date ?? latest?.date ?? null,
    scheduledPosts: calendar?.summary?.scheduledPosts ?? 0,
    targetPosts: calendar?.summary?.targetPosts ?? 0,
    draftGap: calendar?.summary?.draftGap ?? 0,
    capacityGap: calendar?.summary?.capacityGap ?? 0
  };
}

async function runSourceImportPackGeneration() {
  if (sourcePackRunPromise) throw new Error("Source import pack is already running. Wait for it to finish.");
  sourcePackRunPromise = runNodeScript("scripts/source-import-pack.mjs", "Source import pack")
    .finally(() => {
      sourcePackRunPromise = null;
    });
  const result = await sourcePackRunPromise;
  const pack = await readJson("data/source-import-pack/latest.json", null);
  return {
    ...result,
    date: pack?.date ?? null,
    totalRows: pack?.summary?.totalRows ?? 0,
    topCircle: pack?.summary?.topCircle ?? "",
    csvPath: pack?.summary?.csvPath ?? ""
  };
}

async function runAccountRefillWorkbenchGeneration() {
  if (refillWorkbenchRunPromise) throw new Error("Account refill workbench is already running. Wait for it to finish.");
  refillWorkbenchRunPromise = runNodeScript("scripts/account-refill-workbench.mjs", "Account refill workbench")
    .finally(() => {
      refillWorkbenchRunPromise = null;
    });
  const result = await refillWorkbenchRunPromise;
  const workbench = await readJson("data/account-refill-workbench.json", null);
  return {
    ...result,
    date: workbench?.date ?? null,
    focusAccounts: workbench?.summary?.focusAccounts ?? 0,
    refillAccounts: workbench?.summary?.refillAccounts ?? 0,
    totalRefillNeed: workbench?.summary?.totalRefillNeed ?? 0
  };
}

async function runAffiliateResearchWorkbenchGeneration() {
  if (affiliateWorkbenchRunPromise) throw new Error("Affiliate research workbench is already running. Wait for it to finish.");
  affiliateWorkbenchRunPromise = runNodeScript("scripts/affiliate-research-summary.mjs", "Affiliate research workbench")
    .finally(() => {
      affiliateWorkbenchRunPromise = null;
    });
  const result = await affiliateWorkbenchRunPromise;
  const workbench = await readJson("data/affiliate-research-workbench.json", null);
  return {
    ...result,
    date: workbench?.date ?? null,
    candidates: workbench?.summary?.candidates ?? 0,
    readyToConfigure: workbench?.summary?.readyToConfigure ?? 0,
    researching: workbench?.summary?.researching ?? 0
  };
}

async function runLearningLoopGeneration() {
  if (learningLoopRunPromise) throw new Error("Learning loop refresh is already running. Wait for it to finish.");
  learningLoopRunPromise = (async () => {
    await runNodeScript("scripts/feedback-ops.mjs", "Feedback ops refresh");
    return runNodeScript("scripts/learning-loop.mjs", "Learning loop refresh");
  })().finally(() => {
    learningLoopRunPromise = null;
  });
  const result = await learningLoopRunPromise;
  const loop = await readJson("data/learning-loop.json", null);
  return {
    ...result,
    date: loop?.date ?? null,
    status: loop?.status ?? "unknown",
    stage: loop?.stage ?? "unknown",
    posted: loop?.summary?.posted ?? 0,
    measured: loop?.summary?.measured ?? 0,
    pending: loop?.summary?.pending ?? 0,
    safeNewPosts: loop?.summary?.safeNewPosts ?? 0
  };
}

async function runRoadmapGeneration() {
  const result = await runNodeScript("scripts/roadmap.mjs", "Roadmap refresh");
  const roadmap = await readJson("data/product-roadmap.json", null);
  return {
    ...result,
    date: roadmap?.date ?? null,
    overallScore: roadmap?.overallScore ?? null,
    level: roadmap?.level ?? null,
    blockers: roadmap?.summary?.blockers ?? null
  };
}

async function xStatusWithAccounts() {
  await loadLocalEnv();
  const config = normalizeAccountConfig(await loadXAccountsConfig());
  const globalStatus = getXPublishStatus();
  return {
    ...globalStatus,
    accounts: config.accounts.map((account) => ({
      accountId: account.id,
      displayName: account.displayName,
      handle: account.handle,
      active: account.active,
      authStatus: getAccountXPublishStatus(account.id)
    }))
  };
}

function runNodeScript(relativeScriptPath, label = "Script") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, relativeScriptPath)], {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-12000);
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
      if (code === 0) resolve(result);
      else reject(new Error(`${label} failed (${code}): ${result.stderr || result.stdout || "no output"}`));
    });
  });
}

async function upsertFeedbackWithAccount(body) {
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

async function publishXPost(body) {
  const latest = await loadLatest();
  const accountConfig = normalizeAccountConfig(await loadXAccountsConfig());
  const feedback = await loadFeedback();
  const accountPosts = await loadAccountPosts();
  const payload = withResolvedAccount(validateFeedback({
    ...body,
    copyText: body.text
  }), latest, accountConfig);
  const safety = buildPostingSafety({ payload, accountConfig, accountPosts, feedback });
  if (safety.blockReasons.length) throw new Error(safety.blockReasons[0]);
  const result = await publishToX({ text: body.text, confirmed: body.confirmed, accountId: payload.accountId });
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
    accountId: account.id,
    accountName: account.displayName
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

async function importFeedbackCsv(body) {
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

async function previewFeedbackCsv(body) {
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

async function importCandidatePaste(body) {
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

async function previewCandidatePaste(body) {
  return buildCandidatePastePlan(body);
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

function validateFeedback(body) {
  if (!body.toolName || !body.toolUrl || !body.copyText) {
    throw new Error("toolName, toolUrl and copyText are required");
  }
  return body;
}

function validateQueue(body) {
  if (!body.toolName || !body.toolUrl || !body.type) {
    throw new Error("toolName, toolUrl and type are required");
  }
  return body;
}

function validateCandidate(body) {
  if (!body.name || !body.url) throw new Error("name and url are required");
  try {
    new URL(body.url);
  } catch {
    throw new Error("candidate url must be a valid URL");
  }
  return body;
}

function validateAffiliateResearch(body) {
  if (!body.toolName || !body.toolUrl) throw new Error("toolName and toolUrl are required");
  return body;
}

async function generateReviewOutline(toolName) {
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

async function exportTodayPlan() {
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

function resolveStaticPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  if (cleanPath === "/" || cleanPath === "/dashboard" || cleanPath === "/dashboard/") {
    return path.join(dashboardDir, "index.html");
  }
  if (cleanPath === "/index.html") return path.join(dashboardDir, "index.html");

  const requestPath = cleanPath.replace(/^\/+/, "");
  const candidate = path.normalize(path.join(rootDir, requestPath));
  const isAllowed = allowedRoots.some((allowedRoot) => {
    const relative = path.relative(allowedRoot, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  return isAllowed ? candidate : null;
}

async function serveStatic(request, response) {
  const filePath = resolveStaticPath(request.url ?? "/");
  if (!filePath) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const ext = path.extname(filePath);
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes.get(ext) ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found. Run npm run daily if data/latest.json is missing.");
  }
}

export function startDashboardServer(args = parseArgs(process.argv.slice(2))) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }
    serveStatic(request, response);
  });

  server.listen(args.port, args.host, () => {
    console.log(`Dashboard running at http://${args.host}:${args.port}/dashboard/`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startDashboardServer();
}
