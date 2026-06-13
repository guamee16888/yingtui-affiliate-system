import { access } from "node:fs/promises";
import path from "node:path";
import { ACTIVE_TASK_STATUSES, CORE_COLLECTIONS, CONTENT_RULES_PATH, loadCollection, loadContentRules } from "./lib/core-data.mjs";
import { loadManagerSummary } from "./lib/manager-system.mjs";
import { readJson, rootDir } from "./lib/file-store.mjs";
import { loadStaffSummary } from "./lib/staff-system.mjs";
import { SOURCE_LANE_FILES } from "./lib/source-lanes.mjs";
import { DEFAULT_PUBLISH_SETTINGS, PUBLISH_FILES } from "./lib/publish-data.mjs";

const requiredFiles = [
  "package.json",
  "data/latest.json",
  "data/history.json",
  "data/feedback.json",
  "data/queues.json",
  "data/account-posts.json",
  "data/source-candidates.json",
  "data/account-content-matrix.json",
  "data/account-refill-workbench.json",
  "data/content-ops-plan.json",
  "data/affiliate-research.json",
  "data/review-pages.json",
  "config/affiliate-links.json",
  "config/x-accounts.json",
  "config/content-sources.json",
  "config/voice.json",
  "dashboard/index.html",
  "dashboard/js/app.js",
  "dashboard/style.css",
  "staff/index.html",
  "staff/js/app.js",
  "staff/style.css",
  "manager/index.html",
  "manager/js/app.js",
  "manager/style.css",
  ...Object.values(PUBLISH_FILES),
  ...Object.values(SOURCE_LANE_FILES),
  ...Object.values(CORE_COLLECTIONS),
  CONTENT_RULES_PATH
];

const requiredScripts = [
  "daily",
  "daily:top10",
  "dashboard",
  "history",
  "affiliate-queue",
  "affiliate:research",
  "core:migrate",
  "tasks:generate",
  "tasks:summary",
  "staff:summary",
  "manager:summary",
  "ledger:summary",
  "publish:prepare",
  "publish:dry-run",
  "publish:run",
  "publish:summary",
  "x:connections",
  "workspace:migrate",
  "workspace:summary",
  "lanes:seed",
  "lanes:summary",
  "candidates:ingest",
  "candidates:summary",
  "candidates:convert",
  "sources",
  "source-discovery",
  "source-health",
  "source-queue",
  "source-pack",
  "draft-plan",
  "content-calendar",
  "account-matrix",
  "refill-workbench",
  "content-ops-plan",
  "roadmap",
  "accounts",
  "feedback",
  "feedback-ops",
  "decisions",
  "promote",
  "promotion-review",
  "review:queue",
  "review:generate",
  "today-plan",
  "weekly",
  "backend:contract",
  "admin:preflight",
  "verify:admin-access",
  "demo:sanitize",
  "build:public",
  "build:admin-demo",
  "build:demo",
  "release:check:public",
  "release:check:admin",
  "release:check",
  "check",
  "test"
];

const passed = [];
const warnings = [];
const errors = [];
const jsonCache = {
  "data/feedback.json": await readJson("data/feedback.json", { entries: [] }),
  "data/history.json": await readJson("data/history.json", { tools: [] }),
  "config/affiliate-links.json": await readJson("config/affiliate-links.json", { links: [] }),
  "config/voice.json": await readJson("config/voice.json", { style: { avoid: [] } }),
  "config/x-accounts.json": await readJson("config/x-accounts.json", { accounts: [] }),
  "config/content-sources.json": await readJson("config/content-sources.json", { sources: [], circles: [], dailyTargets: {} }),
  [SOURCE_LANE_FILES.contentLanes]: await readJson(SOURCE_LANE_FILES.contentLanes, { items: [] }),
  [SOURCE_LANE_FILES.workspaces]: await readJson(SOURCE_LANE_FILES.workspaces, { items: [] }),
  [SOURCE_LANE_FILES.workspaceLanes]: await readJson(SOURCE_LANE_FILES.workspaceLanes, { items: [] }),
  [SOURCE_LANE_FILES.sourceConnectors]: await readJson(SOURCE_LANE_FILES.sourceConnectors, { items: [] }),
  [SOURCE_LANE_FILES.sourceFeeds]: await readJson(SOURCE_LANE_FILES.sourceFeeds, { items: [] }),
  [SOURCE_LANE_FILES.rawCandidates]: await readJson(SOURCE_LANE_FILES.rawCandidates, { items: [] }),
  [SOURCE_LANE_FILES.sourceRuns]: await readJson(SOURCE_LANE_FILES.sourceRuns, { items: [] }),
  [PUBLISH_FILES.settings]: await readJson(PUBLISH_FILES.settings, DEFAULT_PUBLISH_SETTINGS),
  [PUBLISH_FILES.xConnections]: await readJson(PUBLISH_FILES.xConnections, { items: [] }),
  [PUBLISH_FILES.publishJobs]: await readJson(PUBLISH_FILES.publishJobs, { items: [] }),
  [PUBLISH_FILES.publishAttempts]: await readJson(PUBLISH_FILES.publishAttempts, { items: [] })
};

for (const file of requiredFiles) {
  try {
    await access(path.join(rootDir, file));
    passed.push(`File exists: ${file}`);
  } catch {
    errors.push(`Missing required file: ${file}`);
  }
}

const pkg = await readJson("package.json", { scripts: {} });
for (const script of requiredScripts) {
  if (pkg.scripts?.[script]) passed.push(`Package script exists: ${script}`);
  else errors.push(`Missing package script: ${script}`);
}

const latest = await readJson("data/latest.json", null);
if (!latest?.date || !Array.isArray(latest.tools)) errors.push("latest.json structure is invalid");
else passed.push("latest.json structure is valid");
for (const key of ["accountStrategy", "sourceHealth", "sourceDiscovery", "contentCalendar", "promotionReview", "feedbackOps"]) {
  if (!latest?.[key]) errors.push(`latest.json ${key} is missing. Run npm run daily.`);
  else passed.push(`latest.json ${key} exists`);
}

const core = await loadCoreForCheck();
checkCollectionShape(core);
checkUniqueIds(core);
checkLedgerAndTasks(core);
checkFeedbackBindings(core);
checkLegacyData(latest);
checkAffiliateLinks();
checkVoice(latest);
checkXAccounts();
checkContentSources();
checkSourceLanes();
checkWorkspaceIds(core);
await checkWorkspaceAccess();
checkPublishSystem(core);

printReport();
if (errors.length) process.exitCode = 1;

async function loadCoreForCheck() {
  const loaded = {};
  for (const [key, filePath] of Object.entries(CORE_COLLECTIONS)) {
    loaded[key] = await loadCollection(filePath);
  }
  loaded.contentRules = await loadContentRules();
  return loaded;
}

function checkCollectionShape(coreData) {
  for (const [key, collection] of Object.entries(coreData)) {
    if (key === "contentRules") continue;
    if (typeof collection.version !== "number") errors.push(`${key} missing numeric version`);
    if (typeof collection.updatedAt !== "string") errors.push(`${key} missing updatedAt`);
    if (!Array.isArray(collection.items)) errors.push(`${key} missing items array`);
    if (typeof collection.version === "number" && typeof collection.updatedAt === "string" && Array.isArray(collection.items)) {
      passed.push(`${key} collection shape is valid`);
    }
  }
  if (!coreData.contentRules?.rules) errors.push("content-rules missing rules object");
  else passed.push("content-rules exists");
}

function checkUniqueIds(coreData) {
  checkUnique(coreData.tools.items, "toolId", "tools");
  checkUnique(coreData.topics.items, "topicId", "topics");
  checkUnique(coreData.copyLibrary.items, "copyId", "copy-library");
  checkUnique(coreData.postTasks.items, "taskId", "post-tasks");
  checkUnique(coreData.postLedger.items, "ledgerId", "post-ledger");
  for (const copy of coreData.copyLibrary.items) {
    if (!copy.normalizedTextHash) errors.push(`copy missing normalizedTextHash: ${copy.copyId || copy.copyText?.slice(0, 30)}`);
  }
}

function checkLedgerAndTasks(coreData) {
  const duplicateLedgerHashes = duplicates(coreData.postLedger.items.map((item) => item.normalizedTextHash).filter(Boolean));
  for (const hash of duplicateLedgerHashes) {
    errors.push(`post-ledger duplicate normalizedTextHash: ${hash}`);
  }
  const duplicateLedgerTaskIds = duplicates(coreData.postLedger.items.map((item) => item.taskId).filter(Boolean));
  for (const taskId of duplicateLedgerTaskIds) {
    errors.push(`post-ledger duplicate taskId: ${taskId}`);
  }
  const ledgerTaskIds = new Set(coreData.postLedger.items.map((item) => item.taskId).filter(Boolean));
  for (const task of coreData.postTasks.items) {
    if (task.status === "posted" && !ledgerTaskIds.has(task.taskId)) {
      errors.push(`posted task missing ledger: ${task.taskId}`);
    }
  }
  const activeCopyIds = coreData.postTasks.items
    .filter((task) => ACTIVE_TASK_STATUSES.has(task.status))
    .map((task) => task.copyId)
    .filter(Boolean);
  for (const copyId of duplicates(activeCopyIds)) {
    errors.push(`active tasks reuse copyId: ${copyId}`);
  }
  const rules = coreData.contentRules.rules ?? {};
  const byAccountDate = new Map();
  for (const task of coreData.postTasks.items.filter((item) => ACTIVE_TASK_STATUSES.has(item.status))) {
    const key = `${task.accountId || "none"}::${task.date}`;
    byAccountDate.set(key, (byAccountDate.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byAccountDate.entries()) {
    const accountId = key.split("::")[0];
    const account = coreData.xAccounts.items.find((item) => item.accountId === accountId);
    const limit = Number(account?.dailyPostLimit ?? rules.defaultDailyPostLimit ?? 10);
    if (count > limit) errors.push(`account active tasks exceed daily limit: ${key} (${count}/${limit})`);
  }
}

function checkPublishSystem(coreData) {
  const settings = awaitJsonSyncWarning(PUBLISH_FILES.settings, DEFAULT_PUBLISH_SETTINGS).settings ?? {};
  const jobs = awaitJsonSyncWarning(PUBLISH_FILES.publishJobs, { items: [] });
  const attempts = awaitJsonSyncWarning(PUBLISH_FILES.publishAttempts, { items: [] });
  const connections = awaitJsonSyncWarning(PUBLISH_FILES.xConnections, { items: [] });
  if (!settings) errors.push("publish settings missing settings object");
  if (settings.globalAutoPublishEnabled !== false) errors.push("globalAutoPublishEnabled must remain false by default");
  else passed.push("publish global auto is safely off");
  if (settings.dryRunByDefault !== true) errors.push("publish dryRunByDefault must be true by default");
  else passed.push("publish dry-run default is on");
  if (Array.isArray(settings.allowedPublishModes) && settings.allowedPublishModes.includes("auto") && !settings.globalAutoPublishEnabled) {
    warnings.push("auto mode is allowed while global auto publish is off");
  }
  if (!Array.isArray(jobs.items)) errors.push("publish-jobs missing items array");
  else passed.push("publish-jobs structure is valid");
  if (!Array.isArray(attempts.items)) errors.push("publish-attempts missing items array");
  else passed.push("publish-attempts structure is valid");
  if (!Array.isArray(connections.items)) errors.push("x-connections missing items array");
  else passed.push("x-connections structure is valid");
  for (const connection of connections.items ?? []) {
    if (JSON.stringify(connection).match(/access_token|refresh_token|X_ACCESS_TOKEN/i)) {
      errors.push(`x connection appears to contain raw token material: ${connection.connectionId || connection.accountId}`);
    }
  }
  const taskById = new Map(coreData.postTasks.items.map((task) => [task.taskId, task]));
  for (const job of jobs.items ?? []) {
    const task = taskById.get(job.taskId);
    if (job.status === "ready") {
      if (!task || task.approvalStatus !== "approved") errors.push(`ready publish job is not approved: ${job.jobId}`);
      if (job.tweetLengthStatus?.fitsXPost === false) errors.push(`ready publish job is over 280: ${job.jobId}`);
    }
  }
}

function checkFeedbackBindings(coreData) {
  const feedback = awaitJsonSyncWarning("data/feedback.json", { entries: [] });
  const toolIds = new Set(coreData.tools.items.map((item) => item.toolId));
  const copyIds = new Set(coreData.copyLibrary.items.map((item) => item.copyId));
  const taskIds = new Set(coreData.postTasks.items.map((item) => item.taskId));
  for (const entry of feedback.entries ?? []) {
    if (entry.toolId && !toolIds.has(entry.toolId)) warnings.push(`feedback toolId not in tools: ${entry.id}`);
    if (entry.copyId && !copyIds.has(entry.copyId)) warnings.push(`feedback copyId not in copy-library: ${entry.id}`);
    if (entry.taskId && !taskIds.has(entry.taskId)) warnings.push(`feedback taskId not in post-tasks: ${entry.id}`);
    if (!entry.taskId || !entry.copyId || !entry.toolId) warnings.push(`feedback needs linking: ${entry.id}`);
  }
}

function checkLegacyData(latestData) {
  const history = awaitJsonSyncWarning("data/history.json", { tools: [] });
  if ((history.tools ?? []).some((tool) => /Sample/i.test(tool.toolName ?? ""))) {
    errors.push("history appears to contain fallback sample tools");
  }
  if (latestData?.source?.usedFallback) warnings.push("latest.json uses fallback sample; do not publish from this data.");
  if (core.tools.items.some((tool) => /Sample Product Hunt/i.test(tool.name ?? ""))) {
    errors.push("tools appears to contain fallback sample tools");
  }
}

function checkAffiliateLinks() {
  const affiliate = awaitJsonSyncWarning("config/affiliate-links.json", { links: [] });
  for (const link of affiliate.links ?? []) {
    const url = String(link.affiliateUrl ?? "");
    if (/example\.com|your-id|your_ref|placeholder/i.test(url)) {
      errors.push(`fake or placeholder affiliate link configured: ${link.name || link.match || url}`);
    }
  }
}

function checkVoice(latestData) {
  const voice = awaitJsonSyncWarning("config/voice.json", { style: { avoid: [] } });
  const forbidden = voice.style?.avoid ?? [];
  for (const tool of latestData?.tools ?? []) {
    for (const text of Object.values(tool.copyVariants ?? {})) {
      for (const word of forbidden) {
        if (String(text).toLowerCase().includes(String(word).toLowerCase())) {
          errors.push(`Forbidden word "${word}" found in copy for ${tool.name}`);
        }
      }
      if (String(text).trim().length > 280) {
        errors.push(`Copy is ${String(text).trim().length}/280 characters for ${tool.name}`);
      }
      if (/example\.com\/\?ref=your-id/i.test(text)) errors.push(`Fake affiliate link found in copy for ${tool.name}`);
    }
  }
}

function checkXAccounts() {
  const xAccounts = awaitJsonSyncWarning("config/x-accounts.json", { accounts: [] });
  if (!Array.isArray(xAccounts.accounts) || xAccounts.accounts.length < 1) errors.push("x-accounts config has no accounts");
  if ((xAccounts.accounts ?? []).length > Number(xAccounts.rotationPolicy?.maxAccounts ?? 10)) {
    errors.push("x-accounts config exceeds maxAccounts");
  }
}

function checkContentSources() {
  const contentSources = awaitJsonSyncWarning("config/content-sources.json", { sources: [], circles: [], dailyTargets: {} });
  if (!Array.isArray(contentSources.sources)) errors.push("content-sources config has invalid sources");
  if (!Array.isArray(contentSources.circles) || contentSources.circles.length < 4) {
    errors.push("content-sources config should define the four target circles");
  }
}

function checkSourceLanes() {
  const laneIds = ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"];
  const lanes = awaitJsonSyncWarning(SOURCE_LANE_FILES.contentLanes, { items: [] });
  const workspaces = awaitJsonSyncWarning(SOURCE_LANE_FILES.workspaces, { items: [] });
  const workspaceLanes = awaitJsonSyncWarning(SOURCE_LANE_FILES.workspaceLanes, { items: [] });
  const connectors = awaitJsonSyncWarning(SOURCE_LANE_FILES.sourceConnectors, { items: [] });
  const feeds = awaitJsonSyncWarning(SOURCE_LANE_FILES.sourceFeeds, { items: [] });
  const rawCandidates = awaitJsonSyncWarning(SOURCE_LANE_FILES.rawCandidates, { items: [] });
  const sourceRuns = awaitJsonSyncWarning(SOURCE_LANE_FILES.sourceRuns, { items: [] });
  for (const laneId of laneIds) {
    if ((lanes.items ?? []).some((lane) => lane.laneId === laneId)) passed.push(`source lane exists: ${laneId}`);
    else errors.push(`missing source lane: ${laneId}`);
  }
  for (const [label, collection] of [["workspace-lanes", workspaceLanes], ["source-feeds", feeds], ["source-runs", sourceRuns], ["raw-candidates", rawCandidates]]) {
    if (!Array.isArray(collection.items)) errors.push(`${label} missing items array`);
    else passed.push(`${label} structure is valid`);
  }
  if (!(workspaces.items ?? []).length) errors.push("workspaces has no workspace");
  for (const workspace of workspaces.items ?? []) {
    const explicit = (workspaceLanes.items ?? [])
      .filter((item) => item.workspaceId === workspace.workspaceId && item.enabled !== false)
      .map((item) => item.laneId);
    const enabled = explicit.length ? explicit : workspace.enabledLaneIds ?? [];
    if (workspace.active !== false && !enabled.length) errors.push(`active workspace has no enabled lanes: ${workspace.workspaceId}`);
  }
  for (const connector of connectors.items ?? []) {
    if (!connector.laneIds?.length) warnings.push(`source connector has no lanes: ${connector.connectorId}`);
  }
  const normalizedUrls = new Set();
  const duplicateUrls = new Set();
  for (const candidate of rawCandidates.items ?? []) {
    if (!candidate.laneIds?.length) warnings.push(`raw candidate has no lanes: ${candidate.candidateId}`);
    const url = String(candidate.url || "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (url) {
      if (normalizedUrls.has(url)) duplicateUrls.add(url);
      normalizedUrls.add(url);
    }
    if (/example\.com/i.test(candidate.url || "")) errors.push(`raw candidate contains fallback/example URL: ${candidate.candidateId || candidate.title}`);
    const cryptoRiskText = [candidate.title, candidate.summary, candidate.rawText].join(" ").toLowerCase();
    if ((candidate.laneIds ?? []).includes("crypto_builders") && /price prediction|pump|financial advice|investment advice|signal/.test(cryptoRiskText)) {
      const hasFlag = (candidate.riskFlags ?? []).some((flag) => flag.type === "crypto_blocked_topic");
      if (!hasFlag) errors.push(`crypto high risk candidate missing riskFlags: ${candidate.candidateId}`);
    }
  }
  for (const url of duplicateUrls) warnings.push(`raw candidate duplicate URL: ${url}`);
}

function checkWorkspaceIds(coreData) {
  const workspaces = awaitJsonSyncWarning(SOURCE_LANE_FILES.workspaces, { items: [] });
  const known = new Set((workspaces.items ?? []).map((workspace) => workspace.workspaceId));
  for (const account of coreData.xAccounts.items) {
    if (!account.workspaceId) errors.push(`account missing workspaceId: ${account.accountId}`);
    else if (!known.has(account.workspaceId)) errors.push(`account references unknown workspaceId: ${account.accountId} -> ${account.workspaceId}`);
  }
  for (const user of coreData.users.items) {
    const inferred = coreData.assignments.items.some((assignment) => assignment.userId === user.userId);
    if (!user.workspaceId && !inferred) warnings.push(`user missing workspaceId and cannot be inferred: ${user.userId}`);
  }
  for (const task of coreData.postTasks.items) {
    if (!task.workspaceId) errors.push(`post-task missing workspaceId: ${task.taskId}`);
  }
  for (const item of coreData.postLedger.items) {
    if (!item.workspaceId) errors.push(`post-ledger missing workspaceId: ${item.ledgerId}`);
  }
  const jobs = awaitJsonSyncWarning(PUBLISH_FILES.publishJobs, { items: [] });
  for (const job of jobs.items ?? []) {
    if (!job.workspaceId) errors.push(`publish-job missing workspaceId: ${job.jobId}`);
  }
}

async function checkWorkspaceAccess() {
  const workspaces = awaitJsonSyncWarning(SOURCE_LANE_FILES.workspaces, { items: [] }).items ?? [];
  const first = workspaces.find((workspace) => workspace.active !== false);
  if (!first) return;
  const managerId = first.managerUserIds?.[0] || "";
  const staffId = first.staffUserIds?.[0] || "";
  if (managerId) {
    const summary = await loadManagerSummary({ workspaceId: first.workspaceId, managerUserId: managerId });
    const leaked = (summary.tasks ?? []).some((task) => task.workspaceId !== first.workspaceId);
    if (leaked) errors.push("manager summary returned another workspace task");
    else passed.push("manager summary is workspace-scoped");
  }
  if (staffId) {
    const summary = await loadStaffSummary({ workspaceId: first.workspaceId, userId: staffId });
    const leaked = (summary.tasks ?? []).some((task) => task.workspaceId !== first.workspaceId || task.assignedTo !== staffId);
    if (leaked) errors.push("staff summary returned another workspace or another staff task");
    else passed.push("staff summary is workspace/user-scoped");
  }
}

function checkUnique(items, field, label) {
  const values = items.map((item) => item[field]).filter(Boolean);
  const dupes = duplicates(values);
  if (dupes.length) {
    for (const dupe of dupes) errors.push(`${label} duplicate ${field}: ${dupe}`);
  } else {
    passed.push(`${label} ${field} values are unique`);
  }
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

function awaitJsonSyncWarning(filePath, fallback) {
  return jsonCache[filePath] ?? fallback;
}

function printReport() {
  console.log("System check report");
  console.log(`passed: ${passed.length}`);
  for (const item of passed.slice(0, 12)) console.log(`- ${item}`);
  if (passed.length > 12) console.log(`- ...${passed.length - 12} more passed checks`);

  console.log(`warnings: ${warnings.length}`);
  for (const item of warnings) console.log(`- ${item}`);

  console.log(`errors: ${errors.length}`);
  for (const item of errors) console.log(`- ${item}`);

if (!errors.length) console.log("System check passed");
}
