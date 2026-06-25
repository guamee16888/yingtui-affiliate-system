import { CORE_COLLECTIONS, loadCollection, loadContentRules, saveCollection } from "./core-data.mjs";
import { createLedgerId, createStableId } from "./ids.mjs";
import { hashText } from "./text-normalizer.mjs";
import { SOURCE_LANE_FILES } from "./source-lanes.mjs";
import { PUBLISH_FILES, loadPublishCollection, loadPublishSettings, publicConnection, savePublishCollection } from "./publish-data.mjs";
import { evaluatePublishSafety, resolvePublishMode } from "./publish-safety.mjs";

const JOB_SOURCE_STATUSES = new Set(["approved", "assigned", "scheduled", "copied"]);

export async function preparePublishJobs(options = {}) {
  const data = await loadPublishEngineData();
  const result = buildPublishJobs({
    ...data,
    workspaceId: options.workspaceId || "",
    now: options.now || new Date()
  });
  await savePublishCollection(PUBLISH_FILES.publishJobs, { ...data.publishJobs, items: result.jobs });
  return result.summary;
}

export async function dryRunPublishJobs(options = {}) {
  const data = await loadPublishEngineData();
  const result = evaluatePublishJobs({ ...data, live: false, now: options.now || new Date() });
  await savePublishCollection(PUBLISH_FILES.publishJobs, { ...data.publishJobs, items: result.jobs });
  return result.summary;
}

export async function runPublishJobs(options = {}) {
  const live = Boolean(options.live);
  const actorRole = options.actorRole || "admin";
  if (live && !["manager", "admin"].includes(actorRole)) throw new Error("Only manager/admin can run live publish.");
  const data = await loadPublishEngineData();
  const result = await executePublishJobs({ ...data, live, actorRole, now: options.now || new Date() });
  await Promise.all([
    savePublishCollection(PUBLISH_FILES.publishJobs, { ...data.publishJobs, items: result.jobs }),
    savePublishCollection(PUBLISH_FILES.publishAttempts, { ...data.publishAttempts, items: result.attempts }),
    saveCollection(CORE_COLLECTIONS.postTasks, { ...data.postTasks, items: result.tasks }),
    saveCollection(CORE_COLLECTIONS.postLedger, { ...data.postLedger, items: result.ledger }),
    saveCollection(CORE_COLLECTIONS.copyLibrary, { ...data.copyLibrary, items: result.copyLibrary })
  ]);
  return result.summary;
}

export async function loadPublishSummary(options = {}) {
  const data = await loadPublishEngineData();
  return buildPublishSummary({ ...data, workspaceId: options.workspaceId || "" });
}

export async function loadXConnectionsSummary() {
  const [xAccounts, xConnections, publishSettings] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadPublishCollection(PUBLISH_FILES.xConnections),
    loadPublishSettings()
  ]);
  return buildXConnectionsSummary({ xAccounts: xAccounts.items, connections: xConnections.items, settings: publishSettings.settings });
}

export async function updateAccountPublishMode(input) {
  if (input.role && !["manager", "admin"].includes(input.role)) throw new Error("Only manager/admin can update publish mode.");
  const accountId = String(input.accountId || "").trim();
  const publishMode = String(input.publishMode || "").trim();
  if (!accountId) throw new Error("accountId is required");
  if (!["manual", "scheduled", "auto"].includes(publishMode)) throw new Error("publishMode must be manual, scheduled, or auto");
  const xAccounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const account = xAccounts.items.find((item) => item.accountId === accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);
  const next = {
    ...account,
    publishMode,
    autoPublishEnabled: Boolean(input.autoPublishEnabled),
    requiresFinalApproval: input.requiresFinalApproval !== false,
    updatedAt: new Date().toISOString()
  };
  const items = xAccounts.items.map((item) => item.accountId === accountId ? next : item);
  await saveCollection(CORE_COLLECTIONS.xAccounts, { ...xAccounts, items });
  return { account: publishAccountView(next) };
}

export async function updatePublishJobStatus(input) {
  const jobId = String(input.jobId || "").trim();
  const action = String(input.action || "").trim();
  if (!jobId) throw new Error("jobId is required");
  if (!["cancel", "retry"].includes(action)) throw new Error("action must be cancel or retry");
  const jobs = await loadPublishCollection(PUBLISH_FILES.publishJobs);
  const job = jobs.items.find((item) => item.jobId === jobId);
  if (!job) throw new Error(`Unknown publish job: ${jobId}`);
  const status = action === "cancel" ? "canceled" : "queued";
  const next = { ...job, status, error: "", updatedAt: new Date().toISOString() };
  const items = jobs.items.map((item) => item.jobId === jobId ? next : item);
  await savePublishCollection(PUBLISH_FILES.publishJobs, { ...jobs, items });
  return { job: next };
}

export function buildPublishJobs({ postTasks, xAccounts, workspaces, publishSettings, publishJobs, workspaceId = "", now = new Date() }) {
  const settings = publishSettings.settings ?? publishSettings;
  const existing = [...(publishJobs.items ?? [])];
  const existingTaskIds = new Set(existing.map((job) => job.taskId));
  let created = 0;
  for (const task of postTasks.items ?? []) {
    const workspace = findWorkspace(workspaces.items ?? [], task.workspaceId || "workspace_default");
    if (workspaceId && workspace?.workspaceId !== workspaceId) continue;
    const account = findAccount(xAccounts.items ?? [], task.accountId);
    const publishMode = resolvePublishMode({ task, account, workspace, settings });
    if (publishMode === "manual") continue;
    if (existingTaskIds.has(task.taskId)) continue;
    if (task.approvalStatus !== "approved") continue;
    if (!JOB_SOURCE_STATUSES.has(task.status)) continue;
    if (task.postedAt || ["posted", "feedback_due"].includes(task.status)) continue;
    existing.push(createPublishJob({ task, workspace, publishMode, now }));
    existingTaskIds.add(task.taskId);
    created += 1;
  }
  return {
    jobs: existing,
    summary: summarizeJobs(existing, { created })
  };
}

export function evaluatePublishJobs(data) {
  const jobs = (data.publishJobs.items ?? []).map((job) => {
    if (["posted", "canceled"].includes(job.status)) return job;
    const safety = safetyForJob(job, data);
    return {
      ...job,
      status: jobStatusFromSafety(job, safety, data.now),
      lastCheckedAt: data.now.toISOString(),
      duplicateCheckResult: safety.duplicateCheckResult ?? {},
      tweetLengthStatus: safety.tweetLengthStatus ?? {},
      safety,
      error: safety.canPublish ? "" : safety.flags?.[0]?.message || "Blocked by publish safety.",
      updatedAt: data.now.toISOString()
    };
  });
  return {
    jobs,
    summary: summarizeJobs(jobs)
  };
}

export async function executePublishJobs(data) {
  const settings = data.publishSettings.settings ?? {};
  const live = Boolean(data.live);
  if (live && !["manager", "admin"].includes(data.actorRole || "admin")) {
    throw new Error("Only manager/admin can run live publish.");
  }
  const jobs = [...(data.publishJobs.items ?? [])];
  let tasks = [...(data.postTasks.items ?? [])];
  let ledger = [...(data.postLedger.items ?? [])];
  let copyLibrary = [...(data.copyLibrary.items ?? [])];
  const attempts = [...(data.publishAttempts.items ?? [])];
  const timestamp = data.now.toISOString();

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (!["queued", "ready", "failed", "blocked"].includes(job.status)) continue;
    const runtimeData = { ...data, postTasks: { ...data.postTasks, items: tasks }, postLedger: { ...data.postLedger, items: ledger }, copyLibrary: { ...data.copyLibrary, items: copyLibrary } };
    const safety = safetyForJob(job, runtimeData, { live });
    if (!safety.canPublish) {
      const blocked = updateJob(job, "blocked", safety, timestamp, safety.flags?.[0]?.message || "Blocked by publish safety.");
      jobs[index] = blocked;
      attempts.push(createAttempt({ job: blocked, safety, mode: live ? "live" : "dry_run", status: "blocked", now: data.now }));
      continue;
    }
    if (!live) {
      const ready = updateJob(job, "ready", safety, timestamp, "");
      jobs[index] = ready;
      attempts.push(createAttempt({ job: ready, safety, mode: "dry_run", status: "success", now: data.now }));
      continue;
    }
    if (!settings.globalAutoPublishEnabled) {
      const blocked = updateJob(job, "blocked", safety, timestamp, "Global auto publish is disabled.");
      jobs[index] = blocked;
      attempts.push(createAttempt({ job: blocked, safety, mode: "live", status: "blocked", error: blocked.error, now: data.now }));
      continue;
    }
    const task = findTask(tasks, job.taskId);
    const account = findAccount(data.xAccounts.items, job.accountId);
    const connection = findConnection(data.xConnections.items, job.accountId);
    const publishing = updateJob(job, "publishing", safety, timestamp, "");
    jobs[index] = publishing;
    const result = await data.publisher({ task, account, connection, dryRun: false, live: true });
    if (!result.ok) {
      const failed = { ...publishing, status: "failed", error: result.error || "Publish failed.", updatedAt: timestamp };
      jobs[index] = failed;
      attempts.push(createAttempt({ job: failed, safety, mode: "live", status: "failed", error: failed.error, responseSummary: result.responseSummary, now: data.now }));
      continue;
    }
    const postedUrl = result.postedUrl || "";
    const postedTask = {
      ...task,
      status: "feedback_due",
      postedAt: timestamp,
      postedUrl,
      feedbackDueAt: timestamp,
      updatedAt: timestamp,
      notes: appendNote(task.notes, "Auto published by AI Creator OS publish engine.")
    };
    tasks = tasks.map((item) => item.taskId === task.taskId ? postedTask : item);
    ledger = upsertLedger({ ledger, task: postedTask, postedUrl, now: data.now });
    copyLibrary = markCopyUsed({ copyLibrary, task: postedTask });
    const postedJob = { ...publishing, status: "posted", postedUrl, xPostId: result.xPostId || "", updatedAt: timestamp };
    jobs[index] = postedJob;
    attempts.push(createAttempt({ job: postedJob, safety, mode: "live", status: "success", xPostId: result.xPostId, postedUrl, responseSummary: result.responseSummary, now: data.now }));
  }

  return {
    jobs,
    tasks,
    ledger,
    copyLibrary,
    attempts,
    summary: summarizeJobs(jobs, { attemptsAdded: attempts.length - (data.publishAttempts.items ?? []).length })
  };
}

async function loadPublishEngineData() {
  const [
    workspaces,
    users,
    xAccounts,
    assignments,
    copyLibrary,
    postTasks,
    postLedger,
    accountHealth,
    contentRules,
    publishSettings,
    xConnections,
    publishJobs,
    publishAttempts
  ] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.copyLibrary),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules(),
    loadPublishSettings(),
    loadPublishCollection(PUBLISH_FILES.xConnections),
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadPublishCollection(PUBLISH_FILES.publishAttempts)
  ]);
  return {
    workspaces,
    users,
    xAccounts,
    assignments,
    copyLibrary,
    postTasks,
    postLedger,
    accountHealth,
    contentRules,
    publishSettings,
    xConnections,
    publishJobs,
    publishAttempts,
    publisher: async (payload) => {
      const { publishXPost } = await import("./x-publisher.mjs");
      return publishXPost(payload);
    }
  };
}

function safetyForJob(job, data, options = {}) {
  const task = findTask(data.postTasks.items, job.taskId);
  const account = findAccount(data.xAccounts.items, job.accountId);
  const workspace = findWorkspace(data.workspaces.items, job.workspaceId || task?.workspaceId || "workspace_default");
  const connection = findConnection(data.xConnections.items, job.accountId);
  return evaluatePublishSafety({
    task,
    account,
    workspace,
    connection,
    settings: data.publishSettings.settings,
    tasks: data.postTasks.items,
    ledger: data.postLedger.items,
    xAccounts: data.xAccounts.items,
    users: data.users.items,
    accountHealth: data.accountHealth.items,
    copyLibrary: data.copyLibrary.items,
    contentRules: data.contentRules,
    now: data.now,
    live: Boolean(options.live)
  });
}

function createPublishJob({ task, workspace, publishMode, now }) {
  const scheduledAt = task.scheduledAt || task.publishWindow || "";
  return {
    jobId: createStableId("pubjob", [task.taskId, task.accountId, publishMode]),
    taskId: task.taskId,
    workspaceId: workspace?.workspaceId || task.workspaceId || "workspace_default",
    accountId: task.accountId || "",
    assignedTo: task.assignedTo || "",
    publishMode,
    status: task.approvalStatus === "approved" ? "queued" : "waiting_approval",
    scheduledAt,
    notBefore: task.notBefore || scheduledAt || "",
    lastCheckedAt: "",
    duplicateCheckResult: {},
    tweetLengthStatus: {},
    error: "",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function jobStatusFromSafety(job, safety, now) {
  if (!safety.canPublish) return "blocked";
  if (job.notBefore && new Date(job.notBefore).getTime() > now.getTime()) return "waiting_approval";
  return "ready";
}

function updateJob(job, status, safety, timestamp, error) {
  return {
    ...job,
    status,
    lastCheckedAt: timestamp,
    duplicateCheckResult: safety.duplicateCheckResult ?? {},
    tweetLengthStatus: safety.tweetLengthStatus ?? {},
    safety,
    error,
    updatedAt: timestamp
  };
}

function createAttempt({ job, safety, mode, status, xPostId = "", postedUrl = "", error = "", responseSummary = {}, now }) {
  return {
    attemptId: createStableId("attempt", [job.jobId, mode, status, now.toISOString(), error]),
    jobId: job.jobId,
    taskId: job.taskId,
    accountId: job.accountId,
    workspaceId: job.workspaceId,
    mode,
    status,
    xPostId: xPostId || "",
    postedUrl: postedUrl || "",
    requestSummary: {
      publishMode: job.publishMode,
      safetyRecommendation: safety.recommendation,
      riskLevel: safety.riskLevel
    },
    responseSummary: responseSummary ?? {},
    error: error || "",
    createdAt: now.toISOString()
  };
}

function upsertLedger({ ledger, task, postedUrl, now }) {
  const ledgerId = createLedgerId(task.taskId, postedUrl || "auto");
  const record = {
    ledgerId,
    taskId: task.taskId,
    workspaceId: task.workspaceId || "workspace_default",
    accountId: task.accountId || "",
    employeeId: task.assignedTo || "",
    toolId: task.toolId || "",
    topicId: task.topicId || "",
    copyId: task.copyId || "",
    normalizedTextHash: hashText(task.copyText || ""),
    postedText: task.copyText || "",
    postedUrl,
    postedAt: task.postedAt || now.toISOString(),
    externalLinks: task.externalLinks ?? [],
    affiliateLinkUsed: task.affiliateLinkUsed || "",
    metrics: task.metrics ?? defaultMetrics(),
    notes: "Auto published by AI Creator OS publish engine.",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return [...ledger.filter((item) => item.ledgerId !== ledgerId && item.taskId !== task.taskId), record];
}

function markCopyUsed({ copyLibrary, task }) {
  return copyLibrary.map((copy) => copy.copyId === task.copyId
    ? {
      ...copy,
      usedByAccountIds: [...new Set([...(copy.usedByAccountIds ?? []), task.accountId].filter(Boolean))],
      usedByTaskIds: [...new Set([...(copy.usedByTaskIds ?? []), task.taskId].filter(Boolean))],
      updatedAt: task.updatedAt
    }
    : copy);
}

function buildPublishSummary(data) {
  const jobs = data.workspaceId
    ? (data.publishJobs.items ?? []).filter((job) => (job.workspaceId || "workspace_default") === data.workspaceId)
    : (data.publishJobs.items ?? []);
  return {
    ...summarizeJobs(jobs),
    workspaceId: data.workspaceId || "",
    settings: data.publishSettings.settings,
    connections: buildXConnectionsSummary({
      xAccounts: data.workspaceId ? data.xAccounts.items.filter((account) => (account.workspaceId || "workspace_default") === data.workspaceId) : data.xAccounts.items,
      connections: data.workspaceId ? data.xConnections.items.filter((connection) => (connection.workspaceId || "workspace_default") === data.workspaceId) : data.xConnections.items,
      settings: data.publishSettings.settings
    }),
    jobs: jobs.slice(0, 50)
  };
}

function summarizeJobs(jobs, extra = {}) {
  const items = Array.isArray(jobs) ? jobs : [];
  const byStatus = countBy(items, "status");
  const byAccount = countBy(items, "accountId");
  const byWorkspace = countBy(items, "workspaceId");
  const blockReasons = {};
  for (const job of items) {
    const reason = job.error || job.safety?.flags?.[0]?.message || "";
    if (["blocked", "failed"].includes(job.status) && reason) blockReasons[reason] = (blockReasons[reason] ?? 0) + 1;
  }
  return {
    totalJobs: items.length,
    queued: byStatus.queued ?? 0,
    ready: byStatus.ready ?? 0,
    posted: byStatus.posted ?? 0,
    failed: byStatus.failed ?? 0,
    blocked: byStatus.blocked ?? 0,
    waitingApproval: byStatus.waiting_approval ?? 0,
    canceled: byStatus.canceled ?? 0,
    byAccount,
    byWorkspace,
    blockReasons: Object.entries(blockReasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    ...extra
  };
}

export function buildXConnectionsSummary({ xAccounts = [], connections = [], settings = {} }) {
  const byAccount = new Map(connections.map((item) => [item.accountId, item]));
  const accounts = xAccounts.map((account) => {
    const connection = byAccount.get(account.accountId);
    return {
      account: publishAccountView(account),
      connection: connection ? publicConnection(connection) : {
        connectionId: "",
        accountId: account.accountId,
        workspaceId: account.workspaceId || "workspace_default",
        handle: account.handle || "",
        xUserId: "",
        status: "not_connected",
        scopes: [],
        tokenRef: "",
        lastVerifiedAt: "",
        error: "",
        createdAt: "",
        updatedAt: ""
      }
    };
  });
  return {
    totalAccounts: accounts.length,
    connected: accounts.filter((item) => item.connection.status === "connected").length,
    notConnected: accounts.filter((item) => item.connection.status === "not_connected").length,
    expired: accounts.filter((item) => item.connection.status === "expired").length,
    revoked: accounts.filter((item) => item.connection.status === "revoked").length,
    error: accounts.filter((item) => item.connection.status === "error").length,
    autoPublishAccounts: accounts.filter((item) => item.account.publishMode === "auto" || item.account.autoPublishEnabled).length,
    globalAutoPublishEnabled: Boolean(settings.globalAutoPublishEnabled),
    dryRunByDefault: settings.dryRunByDefault !== false,
    accounts
  };
}

function publishAccountView(account) {
  return {
    accountId: account.accountId,
    handle: account.handle || "",
    persona: account.persona || account.accountId,
    niche: account.niche || "",
    status: account.status || (account.active === false ? "paused" : "active"),
    publishMode: account.publishMode || "manual",
    autoPublishEnabled: Boolean(account.autoPublishEnabled),
    requiresFinalApproval: account.requiresFinalApproval !== false
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "none";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function findTask(tasks, taskId) {
  return tasks.find((task) => task.taskId === taskId) ?? null;
}

function findAccount(accounts, accountId) {
  return accounts.find((account) => account.accountId === accountId) ?? null;
}

function findWorkspace(workspaces, workspaceId) {
  return workspaces.find((workspace) => workspace.workspaceId === workspaceId)
    ?? workspaces.find((workspace) => workspace.workspaceId === "workspace_default")
    ?? null;
}

function findConnection(connections, accountId) {
  return connections.find((connection) => connection.accountId === accountId) ?? null;
}

function appendNote(existing, note) {
  return [existing, note].filter(Boolean).join("\n").trim();
}

function defaultMetrics() {
  return {
    impressions: 0,
    likes: 0,
    bookmarks: 0,
    replies: 0,
    reposts: 0,
    clicks: 0,
    profileVisits: 0
  };
}
