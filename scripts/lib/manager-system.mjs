import { CORE_COLLECTIONS, loadCollection, loadContentRules, saveCollection } from "./core-data.mjs";
import { loadFeedback } from "./storage/interface.mjs";
import { checkTaskDuplicateRisk } from "./duplicate-checker.mjs";
import { PUBLISH_FILES, loadPublishCollection } from "./publish-data.mjs";
import { SOURCE_LANE_FILES } from "./source-lanes.mjs";
import { calculateAccountHealth } from "./account-health-engine.mjs";
import { analyzeTweetLength } from "./tweet-length.mjs";

const MANAGER_VISIBLE_STATUSES = new Set([
  "pending_review",
  "draft",
  "approved",
  "assigned",
  "copied",
  "posted",
  "feedback_due",
  "feedback_done",
  "skipped"
]);

const LOCKED_TASK_STATUSES = new Set(["copied", "feedback_due", "feedback_done", "posted", "skipped"]);

export async function loadManagerSummary(options = {}) {
  const [
    workspaces,
    users,
    xAccounts,
    assignments,
    postTasks,
    postLedger,
    publishJobs,
    feedback,
    accountHealth,
    contentRules
  ] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadFeedback(),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules()
  ]);

  return buildManagerSummary({
    managerUserId: options.managerUserId || "",
    workspaceId: options.workspaceId || "",
    workspaces: workspaces.items,
    users: users.items,
    xAccounts: xAccounts.items,
    assignments: assignments.items,
    tasks: postTasks.items,
    ledger: postLedger.items,
    publishJobs: publishJobs.items,
    feedback: feedback.entries ?? [],
    accountHealth: accountHealth.items,
    contentRules
  });
}

export async function updateManagerTaskAction(input) {
  const [
    workspaces,
    users,
    xAccounts,
    assignments,
    copyLibrary,
    postTasks,
    postLedger,
    publishJobs,
    feedback,
    accountHealth,
    contentRules
  ] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.copyLibrary),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadFeedback(),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules()
  ]);

  const result = applyManagerTaskAction({
    input,
    workspaces: workspaces.items,
    users: users.items,
    xAccounts: xAccounts.items,
    assignments: assignments.items,
    copyLibrary: copyLibrary.items,
    tasks: postTasks.items,
    ledger: postLedger.items,
    accountHealth: accountHealth.items,
    contentRules
  });

  await saveCollection(CORE_COLLECTIONS.postTasks, { ...postTasks, items: result.tasks });

  return {
    task: result.task,
    summary: buildManagerSummary({
      managerUserId: result.manager.userId,
      workspaceId: result.workspace.workspaceId,
      workspaces: workspaces.items,
      users: users.items,
      xAccounts: xAccounts.items,
      assignments: assignments.items,
      tasks: result.tasks,
      ledger: postLedger.items,
      publishJobs: publishJobs.items,
      feedback: feedback.entries ?? [],
      accountHealth: accountHealth.items,
      contentRules
    })
  };
}

export async function updateManagerTaskBatchAction(input) {
  const [
    workspaces,
    users,
    xAccounts,
    assignments,
    copyLibrary,
    postTasks,
    postLedger,
    publishJobs,
    feedback,
    accountHealth,
    contentRules
  ] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.copyLibrary),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadFeedback(),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules()
  ]);

  const result = applyManagerTaskBatchAction({
    input,
    workspaces: workspaces.items,
    users: users.items,
    xAccounts: xAccounts.items,
    assignments: assignments.items,
    copyLibrary: copyLibrary.items,
    tasks: postTasks.items,
    ledger: postLedger.items,
    accountHealth: accountHealth.items,
    contentRules
  });

  await saveCollection(CORE_COLLECTIONS.postTasks, { ...postTasks, items: result.tasks });

  return {
    updated: result.updated,
    failed: result.failed,
    summary: buildManagerSummary({
      managerUserId: input.managerUserId || result.manager?.userId || "",
      workspaceId: input.workspaceId || result.workspace?.workspaceId || "",
      workspaces: workspaces.items,
      users: users.items,
      xAccounts: xAccounts.items,
      assignments: assignments.items,
      tasks: result.tasks,
      ledger: postLedger.items,
      publishJobs: publishJobs.items,
      feedback: feedback.entries ?? [],
      accountHealth: accountHealth.items,
      contentRules
    })
  };
}

export function buildManagerSummary({
  managerUserId = "",
  workspaceId = "",
  workspaces = [],
  users = [],
  xAccounts = [],
  assignments = [],
  tasks = [],
  ledger = [],
  publishJobs = [],
  feedback = [],
  accountHealth = [],
  contentRules = {}
}) {
  const activeUsers = users.filter((user) => user.active !== false);
  const activeWorkspaces = workspaces.filter((workspace) => workspace.active !== false);
  const selectedWorkspace = resolveWorkspace(workspaceId, activeWorkspaces);
  const selectedManager = resolveManager(managerUserId, selectedWorkspace, activeUsers);
  const accessAllowed = managerCanAccessWorkspace(selectedManager, selectedWorkspace);

  const accounts = selectedWorkspace && accessAllowed
    ? workspaceAccounts(selectedWorkspace, xAccounts, assignments)
    : [];
  const staff = selectedWorkspace && accessAllowed
    ? workspaceStaff(selectedWorkspace, activeUsers, assignments, accounts)
    : [];
  const accountNames = new Map(accounts.map((account) => [account.accountId, account.persona || account.handle || account.accountId]));
  const staffNames = new Map(staff.map((user) => [user.userId, user.name || user.userId]));
  const visibleTasks = selectedWorkspace && accessAllowed
    ? tasks
      .filter((task) => taskWorkspaceId(task) === selectedWorkspace.workspaceId)
      .filter((task) => MANAGER_VISIBLE_STATUSES.has(task.status) || task.approvalStatus === "pending")
      .map((task) => managerTaskView(task, { accountNames, staffNames, ledger }))
      .sort(managerTaskSort)
    : [];
  const workspacePublishJobs = selectedWorkspace && accessAllowed
    ? publishJobs.filter((job) => (job.workspaceId || "workspace_default") === selectedWorkspace.workspaceId)
    : [];
  const workspaceFeedback = selectedWorkspace && accessAllowed
    ? feedback.filter((entry) => (entry.workspaceId || "workspace_default") === selectedWorkspace.workspaceId)
    : [];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    selectedWorkspace: selectedWorkspace ? workspaceView(selectedWorkspace) : null,
    selectedManager: selectedManager ? userView(selectedManager) : null,
    accessAllowed,
    accessError: accessAllowed ? "" : "Selected manager is not allowed to review this workspace.",
    workspaces: activeWorkspaces
      .filter((workspace) => managerCanAccessWorkspace(selectedManager, workspace))
      .map(workspaceView),
    managers: selectedWorkspace
      ? workspaceManagers(selectedWorkspace, activeUsers).map(userView)
      : [],
    staff: staff.map(userView),
    accounts: accounts.map((account) => accountView(account, {
      workspace: selectedWorkspace,
      tasks,
      ledger,
      feedback,
      accountHealth,
      contentRules
    })),
    summary: {
      ...summarizeManagerTasks(visibleTasks),
      publishJobs: workspacePublishJobs.length,
      feedback: workspaceFeedback.length,
      ledger: selectedWorkspace && accessAllowed
        ? ledger.filter((item) => (item.workspaceId || "workspace_default") === selectedWorkspace.workspaceId).length
        : 0
    },
    publishJobs: workspacePublishJobs.slice(0, 50),
    tasks: visibleTasks
  };
}

export function applyManagerTaskBatchAction({
  input,
  workspaces = [],
  users = [],
  xAccounts = [],
  assignments = [],
  copyLibrary = [],
  tasks = [],
  ledger = [],
  accountHealth = [],
  contentRules = {},
  now = new Date()
}) {
  const taskIds = [...new Set((input?.taskIds ?? []).map((taskId) => String(taskId || "").trim()).filter(Boolean))];
  if (!taskIds.length) throw new Error("taskIds is required");
  const action = String(input?.action || "").trim();
  if (!["approve", "reject", "assign"].includes(action)) throw new Error("action must be approve, reject, or assign");

  let currentTasks = [...tasks];
  const updated = [];
  const failed = [];
  let workspace = null;
  let manager = null;

  for (const taskId of taskIds) {
    try {
      const result = applyManagerTaskAction({
        input: { ...input, taskId },
        workspaces,
        users,
        xAccounts,
        assignments,
        copyLibrary,
        tasks: currentTasks,
        ledger,
        accountHealth,
        contentRules,
        now
      });
      currentTasks = result.tasks;
      workspace = result.workspace;
      manager = result.manager;
      updated.push({ taskId, status: result.task.status, approvalStatus: result.task.approvalStatus });
    } catch (error) {
      failed.push({ taskId, error: error.message });
    }
  }

  return { workspace, manager, tasks: currentTasks, updated, failed };
}

export function applyManagerTaskAction({
  input,
  workspaces = [],
  users = [],
  xAccounts = [],
  assignments = [],
  copyLibrary = [],
  tasks = [],
  ledger = [],
  accountHealth = [],
  contentRules = {},
  now = new Date()
}) {
  const action = String(input?.action || "").trim();
  if (!["approve", "reject", "assign"].includes(action)) throw new Error("action must be approve, reject, or assign");
  const taskId = String(input?.taskId || "").trim();
  if (!taskId) throw new Error("taskId is required");

  const task = tasks.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);

  const activeWorkspaces = workspaces.filter((workspace) => workspace.active !== false);
  const workspace = resolveWorkspace(input?.workspaceId || taskWorkspaceId(task), activeWorkspaces);
  if (!workspace) throw new Error("workspace is required");
  if (taskWorkspaceId(task) !== workspace.workspaceId) {
    throw new Error("This task does not belong to the selected workspace.");
  }

  const activeUsers = users.filter((user) => user.active !== false);
  const manager = resolveManager(input?.managerUserId || task.managerUserId, workspace, activeUsers);
  if (!managerCanAccessWorkspace(manager, workspace)) {
    throw new Error("Selected manager is not allowed to review this workspace.");
  }

  const accounts = workspaceAccounts(workspace, xAccounts, assignments);
  const staff = workspaceStaff(workspace, activeUsers, assignments, accounts);
  const timestamp = now.toISOString();
  const nextTask = applyActionToTask(task, {
    action,
    input,
    manager,
    workspace,
    accounts,
    staff,
    timestamp
  });
  const checkedTask = action === "reject"
    ? nextTask
    : withDuplicateCheck(nextTask, {
      tasks,
      ledger,
      xAccounts,
      users,
      accountHealth,
      copyLibrary,
      contentRules
    });

  if (action === "approve") {
    assertTaskCanApprove(checkedTask);
  }

  const finalTask = checkedTask.duplicateCheckResult?.riskLevel === "block" && action !== "reject"
    ? {
      ...checkedTask,
      status: "draft",
      approvalStatus: "rejected",
      notes: appendNote(checkedTask.notes, "Manager review auto-rejected because duplicate/risk check returned block.")
    }
    : checkedTask;
  const nextTasks = tasks.map((item) => item.taskId === task.taskId ? finalTask : item);

  return { workspace, manager, task: finalTask, tasks: nextTasks };
}

function resolveWorkspace(workspaceId, workspaces) {
  const requested = String(workspaceId || "").trim();
  return workspaces.find((workspace) => workspace.workspaceId === requested)
    ?? workspaces.find((workspace) => workspace.workspaceId === "workspace_default")
    ?? workspaces[0]
    ?? null;
}

function resolveManager(managerUserId, workspace, users) {
  const requested = String(managerUserId || "").trim();
  if (requested) return users.find((user) => user.userId === requested) ?? null;
  const managerIds = workspace?.managerUserIds ?? [];
  return users.find((user) => managerIds.includes(user.userId))
    ?? users.find((user) => ["manager", "admin"].includes(user.role))
    ?? users[0]
    ?? null;
}

function managerCanAccessWorkspace(manager, workspace) {
  if (!manager || !workspace) return false;
  const managerIds = workspace.managerUserIds ?? [];
  if (managerIds.includes(manager.userId)) return true;
  return managerIds.length === 0 && ["manager", "admin"].includes(manager.role);
}

function workspaceManagers(workspace, users) {
  const managerIds = new Set(workspace.managerUserIds ?? []);
  return users.filter((user) => managerIds.has(user.userId));
}

function workspaceStaff(workspace, users, assignments, accounts) {
  const staffIds = new Set(workspace.staffUserIds ?? []);
  const accountIds = new Set(accounts.map((account) => account.accountId));
  for (const assignment of assignments) {
    if (assignment.active === false) continue;
    if (accountIds.has(assignment.accountId)) staffIds.add(assignment.userId);
  }
  return users.filter((user) => staffIds.has(user.userId));
}

function workspaceAccounts(workspace, xAccounts, assignments) {
  const workspaceUserIds = new Set([...(workspace.managerUserIds ?? []), ...(workspace.staffUserIds ?? [])]);
  const assignmentAccountIds = new Set(assignments
    .filter((assignment) => assignment.active !== false && workspaceUserIds.has(assignment.userId))
    .map((assignment) => assignment.accountId));
  const accounts = xAccounts.filter((account) => {
    const status = account.status || (account.active === false ? "paused" : "active");
    if (!["active", "paused", "archived"].includes(status)) return false;
    if (account.workspaceId && account.workspaceId === workspace.workspaceId) return true;
    if (assignmentAccountIds.has(account.accountId)) return true;
    if (workspaceUserIds.has(account.managerUserId) || workspaceUserIds.has(account.ownerUserId)) return true;
    return false;
  });
  return uniqueBy(accounts, "accountId").sort((a, b) => (a.persona || a.accountId).localeCompare(b.persona || b.accountId));
}

function applyActionToTask(task, { action, input, manager, workspace, accounts, staff, timestamp }) {
  if (LOCKED_TASK_STATUSES.has(task.status)) {
    throw new Error("This task is already copied, posted, skipped, or waiting for feedback.");
  }
  if (action === "reject") {
    return {
      ...task,
      workspaceId: taskWorkspaceId(task),
      managerUserId: manager.userId,
      status: "draft",
      approvalStatus: "rejected",
      rejectedBy: manager.userId,
      rejectedAt: timestamp,
      updatedAt: timestamp,
      notes: appendNote(task.notes, input.reason || `Rejected by ${manager.name || manager.userId} in manager review.`)
    };
  }

  const assigned = applyAssignmentFields(task, { input, accounts, staff });
  if (action === "assign") {
    const status = assigned.approvalStatus === "approved" && assigned.accountId && assigned.assignedTo
      ? "assigned"
      : assigned.status === "draft"
        ? "pending_review"
        : assigned.status;
    return {
      ...assigned,
      workspaceId: taskWorkspaceId(task),
      managerUserId: manager.userId,
      status,
      assignedBy: manager.userId,
      assignedAt: timestamp,
      updatedAt: timestamp,
      notes: appendNote(task.notes, `Assigned by ${manager.name || manager.userId} for ${workspace.workspaceId}.`)
    };
  }

  if (!assigned.accountId || !assigned.assignedTo) {
    throw new Error("Assign both account and staff before approving.");
  }
  return {
    ...assigned,
    workspaceId: taskWorkspaceId(task),
    managerUserId: manager.userId,
    status: "assigned",
    approvalStatus: "approved",
    approvedBy: manager.userId,
    approvedAt: timestamp,
    updatedAt: timestamp,
    notes: appendNote(task.notes, `Approved by ${manager.name || manager.userId} in manager review.`)
  };
}

function applyAssignmentFields(task, { input, accounts, staff }) {
  const accountId = String(input.accountId ?? task.accountId ?? "").trim();
  const assignedTo = String(input.assignedTo ?? task.assignedTo ?? "").trim();
  const selectedAccount = accounts.find((account) => account.accountId === accountId);
  if (accountId && !selectedAccount) {
    throw new Error(`Account is not available in this workspace: ${accountId}`);
  }
  if (selectedAccount && (selectedAccount.status || (selectedAccount.active === false ? "paused" : "active")) !== "active") {
    throw new Error(`Account is not active: ${accountId}`);
  }
  if (assignedTo && !staff.some((user) => user.userId === assignedTo)) {
    throw new Error(`Staff user is not available in this workspace: ${assignedTo}`);
  }
  return { ...task, accountId, assignedTo };
}

function withDuplicateCheck(task, context) {
  const result = checkTaskDuplicateRisk({
    task,
    context: {
      ...context,
      tasks: (context.tasks ?? []).filter((item) => item.taskId !== task.taskId)
    }
  });
  return {
    ...task,
    duplicateCheckResult: result,
    riskFlags: result.flags.map((flag) => flag.type)
  };
}

function assertTaskCanApprove(task) {
  const length = analyzeTweetLength(task.copyText || "");
  if (!length.fitsXPost) throw new Error(`Tweet is too long: ${length.weightedCharCount}/280 weighted characters.`);
  if (task.duplicateCheckResult?.riskLevel === "block") {
    const reason = task.duplicateCheckResult.flags?.[0]?.message || "Duplicate checker blocked this task.";
    throw new Error(reason);
  }
}

function managerTaskView(task, { accountNames, staffNames }) {
  const length = analyzeTweetLength(task.copyText || "");
  const riskLevel = task.duplicateCheckResult?.riskLevel || (task.riskFlags?.length ? "medium" : "low");
  const duplicateFlags = task.duplicateCheckResult?.flags ?? [];
  const blockReasons = [
    ...(length.fitsXPost ? [] : [`Over 280 weighted characters (${length.weightedCharCount}).`]),
    ...(riskLevel === "block" ? duplicateFlags.map((flag) => flag.message || flag.type) : []),
    ...(!task.accountId ? ["Account is not assigned."] : []),
    ...(!task.assignedTo ? ["Staff is not assigned."] : [])
  ];
  const locked = LOCKED_TASK_STATUSES.has(task.status);
  const linkPolicy = task.linkPolicy || (task.externalLinks?.length ? "external_link" : "no_link");
  return {
    taskId: task.taskId,
    date: task.date || "",
    workspaceId: taskWorkspaceId(task),
    laneId: task.laneId || "",
    sourceCandidateId: task.sourceCandidateId || "",
    accountId: task.accountId || "",
    accountName: accountNames.get(task.accountId) || task.accountId || "Unassigned account",
    assignedTo: task.assignedTo || "",
    assignedToName: staffNames.get(task.assignedTo) || task.assignedTo || "Unassigned staff",
    managerUserId: task.managerUserId || "",
    toolId: task.toolId || "",
    toolName: task.toolName || task.toolId || "Untitled task",
    toolUrl: task.toolUrl || "",
    topicId: task.topicId || "",
    copyId: task.copyId || "",
    variantType: task.variantType || "shortPost",
    copyText: task.copyText || "",
    tweetText: task.tweetText || task.copyText || "",
    weightedCharCount: length.weightedCharCount,
    fitsTweetLimit: length.fitsXPost,
    publishMode: task.publishMode || "manual",
    duplicateCheckResult: task.duplicateCheckResult ?? {},
    linkPolicy,
    status: task.status || "draft",
    approvalStatus: task.approvalStatus || "pending",
    riskLevel,
    riskFlags: task.riskFlags ?? [],
    duplicateFlags,
    notes: task.notes || "",
    tweetLength: length,
    canAssign: !locked,
    canReject: !locked,
    canApprove: !locked && blockReasons.length === 0,
    blockReasons,
    approvalReasons: blockReasons.length
      ? []
      : [
        "Copy fits the X weighted 280 character limit.",
        "No blocking duplicate risk is currently detected.",
        "Account and staff are assigned inside this workspace."
      ]
  };
}

function summarizeManagerTasks(tasks) {
  return {
    totalTasks: tasks.length,
    pendingReview: tasks.filter((task) => task.approvalStatus === "pending" || task.status === "pending_review").length,
    approved: tasks.filter((task) => task.approvalStatus === "approved").length,
    rejected: tasks.filter((task) => task.approvalStatus === "rejected").length,
    assigned: tasks.filter((task) => task.accountId && task.assignedTo).length,
    unassigned: tasks.filter((task) => !task.accountId || !task.assignedTo).length,
    blocked: tasks.filter((task) => task.riskLevel === "block" || task.blockReasons.length).length,
    copiedOrFeedback: tasks.filter((task) => ["copied", "feedback_due"].includes(task.status)).length
  };
}

function managerTaskSort(a, b) {
  const statusRank = { pending_review: 0, draft: 1, approved: 2, assigned: 2, copied: 3, posted: 3, feedback_due: 4, feedback_done: 5, skipped: 6 };
  return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
    || (a.blockReasons.length ? 0 : 1) - (b.blockReasons.length ? 0 : 1)
    || a.toolName.localeCompare(b.toolName)
    || a.accountName.localeCompare(b.accountName);
}

function taskWorkspaceId(task) {
  return task.workspaceId || "workspace_default";
}

function workspaceView(workspace) {
  return {
    workspaceId: workspace.workspaceId,
    name: workspace.name || workspace.workspaceId,
    plan: workspace.plan || "",
    enabledLaneIds: workspace.enabledLaneIds ?? []
  };
}

function userView(user) {
  return {
    userId: user.userId,
    name: user.name || user.userId,
    role: user.role || "staff"
  };
}

function accountView(account, context = {}) {
  const accountId = account.accountId;
  const workspaceId = account.workspaceId || context.workspace?.workspaceId || "workspace_default";
  const tasks = (context.tasks || []).filter((task) => task.accountId === accountId && taskWorkspaceId(task) === workspaceId);
  const ledger = (context.ledger || []).filter((entry) => entry.accountId === accountId && (entry.workspaceId || "workspace_default") === workspaceId);
  const feedback = (context.feedback || []).filter((entry) => entry.accountId === accountId && (entry.workspaceId || "workspace_default") === workspaceId);
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter((task) => (task.date || task.createdAt || "").startsWith(today));
  const todayPublished = tasks.filter((task) => (task.postedAt || "").startsWith(today) || task.status === "posted").length;
  const feedbackDebt = tasks.filter((task) => ["posted", "feedback_due", "copied"].includes(task.status || "") && !hasAnyMetrics(task.metrics)).length;
  const sevenDayLedger = ledger.filter((entry) => isWithinDays(entry.postedAt || entry.createdAt || entry.updatedAt, 7));
  const health = calculateAccountHealth({
    account,
    tasks,
    ledger: sevenDayLedger.length ? sevenDayLedger : ledger,
    feedback,
    contentRules: context.contentRules
  });
  const storedHealth = (context.accountHealth || []).find((item) => item.accountId === accountId && (item.workspaceId || workspaceId) === workspaceId) || {};

  return {
    accountId: account.accountId,
    handle: account.handle || "",
    persona: account.persona || account.accountId,
    workspaceId,
    workspace: context.workspace?.name || workspaceId,
    laneId: account.laneId || account.contentLaneId || account.niche || "",
    country: account.country || "",
    countryManual: Boolean(account.countryManual),
    region: account.region || "",
    timezone: account.timezone || "",
    language: account.language || "en",
    accountType: account.accountType || "demo",
    connectionStatus: account.connectionStatus || account.oauthStatus || "not_connected",
    oauthConnectionId: account.oauthConnectionId || "",
    publishMode: account.publishMode || "manual",
    networkLabel: account.networkLabel || "",
    ipNote: account.ipNote || "",
    deviceNote: account.deviceNote || "",
    countryRegionNote: account.countryRegionNote || "",
    sessionMode: account.sessionMode || "temp",
    niche: account.niche || "",
    status: account.status || (account.active === false ? "paused" : "active"),
    dailyPostLimit: Number(account.dailyPostLimit || 0),
    externalLinkLimit: Number(account.externalLinkLimit || 0),
    todayTasks: todayTasks.length,
    todayPublished,
    pendingFeedback: feedbackDebt,
    sevenDayPosts: sevenDayLedger.length,
    sevenDayExternalLinks: countExternalLinks(sevenDayLedger),
    healthScore: Number(storedHealth.healthScore ?? storedHealth.score ?? health.healthScore),
    healthStatus: storedHealth.healthStatus || storedHealth.status || health.healthStatus,
    riskFlags: storedHealth.riskFlags || health.riskFlags,
    healthExplanations: storedHealth.explanations || health.explanations
  };
}

function hasAnyMetrics(metrics = {}) {
  return Object.values(metrics || {}).some((value) => Number(value || 0) > 0);
}

function isWithinDays(value, days) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= days * 86400000;
}

function countExternalLinks(items = []) {
  return items.reduce((total, item) => total + (Array.isArray(item.externalLinks) ? item.externalLinks.length : 0), 0);
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function appendNote(existing, note) {
  return [existing, note].filter(Boolean).join("\n").trim();
}
