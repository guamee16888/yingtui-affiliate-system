import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteFeedback,
  loadCandidateInbox,
  loadAffiliateLinks,
  loadAffiliateResearch,
  loadFeedback,
  loadHistoryData,
  loadLatest,
  loadQueues,
  loadReviewPages,
  loadVoiceConfig,
  saveReviewPages,
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
import { writeTextAtomic } from "./lib/file-store.mjs";
import { buildWeeklyReport, generateWeeklyReport } from "./lib/weekly-report.mjs";
import { mapFeedbackCsv } from "./lib/csv-feedback.mjs";
import { parseCandidatePaste } from "./lib/candidate-parser.mjs";
import { buildHistoryIndex, candidateInboxToTools, scoreTool } from "./lib/affiliate-system.mjs";
import { buildDecisionReport } from "./lib/decision-engine.mjs";
import { calculateEngagement } from "./lib/scoring.mjs";
import { getXPublishStatus, publishToX } from "./lib/x-publish.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { todayString } from "./lib/ids.mjs";

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
  if (pathname === "/api/affiliate-links") return loadAffiliateLinks();
  if (pathname === "/api/queues") return loadQueues();
  if (pathname === "/api/review-pages") return loadReviewPages();
  if (pathname === "/api/affiliate-research") return loadAffiliateResearch();
  if (pathname === "/api/settings") {
    const [latest, history, voice, affiliateLinks, feedback, queues, reviews, affiliateResearch, candidateInbox] = await Promise.all([
      loadLatest(),
      loadHistoryData(),
      loadVoiceConfig(),
      loadAffiliateLinks(),
      loadFeedback(),
      loadQueues(),
      loadReviewPages(),
      loadAffiliateResearch(),
      loadCandidateInbox()
    ]);
    return {
      latestDate: latest?.date ?? null,
      historyCount: history.tools?.length ?? 0,
      forbiddenWords: voice.style?.avoid ?? [],
      maxTweetCharacters: voice.style?.maxTweetCharacters ?? 260,
      affiliateLinks: affiliateLinks.links ?? [],
      feedbackCount: feedback.entries?.length ?? 0,
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
  if (pathname === "/api/x/status") return getXPublishStatus();
  throw new Error(`Unknown API route: ${pathname}`);
}

async function handleApiPost(pathname, body) {
  if (pathname === "/api/feedback/upsert") return upsertFeedback(validateFeedback(body));
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
  if (pathname === "/api/x/publish") return publishXPost(body);
  throw new Error(`Unknown API route: ${pathname}`);
}

async function runDailyGeneration() {
  if (dailyRunPromise) throw new Error("Daily refresh is already running. Wait for it to finish.");
  dailyRunPromise = runNodeScript("scripts/generate-daily.mjs")
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

function runNodeScript(relativeScriptPath) {
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
      else reject(new Error(`Daily refresh failed (${code}): ${result.stderr || result.stdout || "no output"}`));
    });
  });
}

async function publishXPost(body) {
  const result = await publishToX({ text: body.text, confirmed: body.confirmed });
  if (body.toolName && body.toolUrl && body.variantType && body.text) {
    const entry = await upsertFeedback({
      toolId: body.toolId,
      toolName: body.toolName,
      toolUrl: body.toolUrl,
      sourceDate: body.sourceDate,
      variantType: body.variantType,
      copyText: body.text,
      posted: true,
      postedUrl: result.url,
      postedAt: new Date().toISOString(),
      metrics: {},
      notes: "Published to X from Dashboard"
    });
    return { ...result, feedbackEntry: entry };
  }
  return result;
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
    entries.push(await upsertFeedback(entry));
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
        postedUrl: entry.postedUrl,
        copyText: entry.copyText,
        metrics: entry.metrics,
        engagementScore: engagement.engagementScore,
        engagementRate: engagement.engagementRate,
        clickRate: engagement.clickRate
      };
    })
  };
}

async function importCandidatePaste(body) {
  if (!body.text || typeof body.text !== "string") throw new Error("paste text is required");
  const parsed = parseCandidatePaste(body.text, {
    source: body.source || "paste",
    sourceUrl: body.sourceUrl || "",
    published: body.published || new Date().toISOString()
  });
  if (!parsed.entries.length) {
    throw new Error(parsed.errors.join(" ") || "No valid candidate rows found.");
  }
  if (parsed.entries.length > 100) throw new Error("Candidate paste import is limited to 100 rows at a time");
  const entries = [];
  for (const entry of parsed.entries) {
    entries.push(await upsertCandidate(entry));
  }
  return { imported: entries.length, entries, errors: parsed.errors };
}

async function previewCandidatePaste(body) {
  if (!body.text || typeof body.text !== "string") throw new Error("paste text is required");
  const date = body.date || (await loadLatest())?.date || todayString();
  const parsed = parseCandidatePaste(body.text, {
    source: body.source || "paste",
    sourceUrl: body.sourceUrl || "",
    published: body.published || new Date().toISOString()
  });
  if (!parsed.entries.length) {
    throw new Error(parsed.errors.join(" ") || "No valid candidate rows found.");
  }
  if (parsed.entries.length > 100) throw new Error("Candidate paste preview is limited to 100 rows at a time");

  const [history, affiliateConfig] = await Promise.all([
    loadHistoryData(),
    loadAffiliateLinks()
  ]);
  const context = {
    date,
    historyIndex: buildHistoryIndex(history, { beforeDate: date }),
    affiliateConfig
  };
  const tools = candidateInboxToTools({ items: parsed.entries }, date);
  const previews = tools
    .map((tool) => candidatePreviewJson(scoreTool(tool, context)))
    .sort((a, b) => Number(b.score) - Number(a.score));

  return {
    date,
    parsed: parsed.entries.length,
    previews,
    errors: parsed.errors
  };
}

function candidatePreviewJson(item) {
  return {
    name: item.tool.name,
    url: item.tool.url,
    tagline: item.tool.tagline,
    published: item.tool.published ?? null,
    sourceName: item.tool.sourceName ?? "Candidate Inbox",
    score: item.score,
    scoreBreakdown: item.scoreBreakdown,
    followUpAction: item.followUpAction,
    recommendedToFollow: item.recommendedToFollow,
    seenBefore: item.seenBefore,
    reason: item.reason,
    affiliateStatus: item.affiliate ? "matched" : "research_needed",
    affiliateLink: item.affiliate?.affiliateUrl ?? null
  };
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
