import { CORE_COLLECTIONS, loadCollection, loadContentRules, saveCollection } from "./core-data.mjs";
import { loadFeedback } from "./data-store.mjs";
import { checkTaskDuplicateRisk } from "./duplicate-checker.mjs";
import { PUBLISH_FILES, loadPublishCollection, savePublishCollection } from "./publish-data.mjs";
import { SOURCE_LANE_FILES, workspaceLaneIds } from "./source-lanes.mjs";
import { analyzeTweetLength } from "./tweet-length.mjs";

const MANAGER_VISIBLE_STATUSES = new Set([
  "pending_review",
  "draft",
  "approved",
  "assigned",
  "copied",
  "feedback_due",
  "skipped"
]);

const LOCKED_TASK_STATUSES = new Set(["copied", "feedback_due", "posted", "skipped"]);

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
    contentLanes,
    workspaceLanes,
    rawCandidates
  ] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadFeedback(),
    loadCollection(SOURCE_LANE_FILES.contentLanes),
    loadCollection(SOURCE_LANE_FILES.workspaceLanes),
    loadCollection(SOURCE_LANE_FILES.rawCandidates)
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
    contentLanes: contentLanes.items,
    workspaceLanes: workspaceLanes.items,
    rawCandidates: rawCandidates.items
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
      feedback: feedback.entries ?? []
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
      feedback: feedback.entries ?? []
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
  contentLanes = [],
  workspaceLanes = [],
  rawCandidates = []
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
  const workspaceLedger = selectedWorkspace && accessAllowed
    ? ledger.filter((item) => (item.workspaceId || "workspace_default") === selectedWorkspace.workspaceId)
    : [];
  const workspaceAssignmentRows = selectedWorkspace && accessAllowed
    ? assignments.filter((assignment) => {
      if (assignment.workspaceId) return assignment.workspaceId === selectedWorkspace.workspaceId;
      return accounts.some((account) => account.accountId === assignment.accountId)
        || staff.some((user) => user.userId === assignment.userId);
    })
    : [];
  const enabledLaneIds = selectedWorkspace && accessAllowed
    ? workspaceLaneIds(selectedWorkspace, workspaceLanes)
    : [];
  const laneViews = enabledLaneIds.map((laneId) => managerLaneView({
    laneId,
    lane: contentLanes.find((item) => item.laneId === laneId),
    rawCandidates,
    tasks: visibleTasks
  }));
  const accountViews = accounts.map((account) => accountView(account, {
    assignments: workspaceAssignmentRows,
    staffNames,
    tasks: visibleTasks,
    ledger: workspaceLedger,
    feedback: workspaceFeedback
  }));
  const staffViews = staff.map((user) => staffConsoleView(user, {
    assignments: workspaceAssignmentRows,
    accountNames,
    tasks: visibleTasks,
    ledger: workspaceLedger
  }));
  const feedbackDebt = buildFeedbackDebt({
    tasks: visibleTasks,
    ledger: workspaceLedger,
    feedback: workspaceFeedback,
    accountNames,
    staffNames
  });
  const risks = buildManagerRisks({
    tasks: visibleTasks,
    accounts: accountViews,
    publishJobs: workspacePublishJobs,
    feedbackDebt,
    lanes: laneViews
  });
  const taskSummary = summarizeManagerTasks(visibleTasks);
  const overview = buildManagerOverview({
    tasks: visibleTasks,
    accounts: accountViews,
    staff: staffViews,
    ledger: workspaceLedger,
    publishJobs: workspacePublishJobs,
    feedbackDebt,
    risks
  });

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
    staff: staffViews,
    accounts: accountViews,
    assignments: workspaceAssignmentRows.map(assignmentView),
    summary: {
      ...taskSummary,
      publishJobs: workspacePublishJobs.length,
      feedback: workspaceFeedback.length,
      ledger: workspaceLedger.length,
      feedbackDebt: feedbackDebt.length,
      blockedRisk: risks.filter((risk) => risk.severity === "block").length,
      enabledLanes: laneViews.length,
      accountLimit: Number(selectedWorkspace?.accountLimit || 0),
      accounts: accountViews.length
    },
    overview,
    publishJobs: workspacePublishJobs.slice(0, 50).map((job) => managerPublishJobView(job, { accountNames })),
    feedbackDebt,
    lanes: laneViews,
    risks,
    settings: selectedWorkspace && accessAllowed ? managerSettingsView(selectedWorkspace, enabledLaneIds) : null,
    tasks: visibleTasks
  };
}

export async function updateManagerAccount(input) {
  const [workspaces, users, xAccounts, assignments, postTasks, postLedger, publishJobs, feedback] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadFeedback()
  ]);
  const workspace = requireManagerWorkspace({
    input,
    workspaces: workspaces.items,
    users: users.items
  });
  const accountId = String(input?.accountId || "").trim();
  if (!accountId) throw new Error("accountId is required");
  const account = xAccounts.items.find((item) => item.accountId === accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);
  if ((account.workspaceId || "workspace_default") !== workspace.workspaceId) {
    throw new Error("这个账号不属于当前 workspace。");
  }

  const next = {
    ...account,
    status: input.status ? safeAccountStatus(input.status) : account.status,
    publishMode: input.publishMode ? safePublishMode(input.publishMode) : account.publishMode,
    autoPublishEnabled: input.autoPublishEnabled === undefined ? Boolean(account.autoPublishEnabled) : Boolean(input.autoPublishEnabled),
    requiresFinalApproval: input.requiresFinalApproval === undefined ? account.requiresFinalApproval !== false : Boolean(input.requiresFinalApproval),
    dailyPostLimit: input.dailyPostLimit === undefined ? account.dailyPostLimit : safeNumber(input.dailyPostLimit, "dailyPostLimit"),
    externalLinkLimit: input.externalLinkLimit === undefined ? account.externalLinkLimit : safeNumber(input.externalLinkLimit, "externalLinkLimit"),
    updatedAt: new Date().toISOString()
  };
  const items = xAccounts.items.map((item) => item.accountId === accountId ? next : item);
  await saveCollection(CORE_COLLECTIONS.xAccounts, { ...xAccounts, items });
  return buildManagerSummary({
    managerUserId: input.managerUserId || "",
    workspaceId: workspace.workspaceId,
    workspaces: workspaces.items,
    users: users.items,
    xAccounts: items,
    assignments: assignments.items,
    tasks: postTasks.items,
    ledger: postLedger.items,
    publishJobs: publishJobs.items,
    feedback: feedback.entries ?? []
  });
}

export async function updateManagerPublishJob(input) {
  const [workspaces, users, xAccounts, assignments, postTasks, postLedger, publishJobs, feedback] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadFeedback()
  ]);
  const workspace = requireManagerWorkspace({
    input,
    workspaces: workspaces.items,
    users: users.items
  });
  const jobId = String(input?.jobId || "").trim();
  const action = String(input?.action || "").trim();
  if (!jobId) throw new Error("jobId is required");
  if (!["cancel", "retry"].includes(action)) throw new Error("action must be cancel or retry");
  const job = publishJobs.items.find((item) => item.jobId === jobId);
  if (!job) throw new Error(`Unknown publish job: ${jobId}`);
  if ((job.workspaceId || "workspace_default") !== workspace.workspaceId) {
    throw new Error("这个发布任务不属于当前 workspace。");
  }
  const next = {
    ...job,
    status: action === "cancel" ? "canceled" : "queued",
    error: "",
    updatedAt: new Date().toISOString()
  };
  const jobs = publishJobs.items.map((item) => item.jobId === jobId ? next : item);
  await savePublishCollection(PUBLISH_FILES.publishJobs, { ...publishJobs, items: jobs });
  return buildManagerSummary({
    managerUserId: input.managerUserId || "",
    workspaceId: workspace.workspaceId,
    workspaces: workspaces.items,
    users: users.items,
    xAccounts: xAccounts.items,
    assignments: assignments.items,
    tasks: postTasks.items,
    ledger: postLedger.items,
    publishJobs: jobs,
    feedback: feedback.entries ?? []
  });
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
    if (status !== "active") return false;
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
  if (accountId && !accounts.some((account) => account.accountId === accountId)) {
    throw new Error(`Account is not available in this workspace: ${accountId}`);
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
  const statusRank = { pending_review: 0, draft: 1, approved: 2, assigned: 2, copied: 3, feedback_due: 4, skipped: 5 };
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

function accountView(account) {
  return accountConsoleView(account, {});
}

function accountConsoleView(account, { assignments = [], staffNames = new Map(), tasks = [], ledger = [], feedback = [] } = {}) {
  const accountTasks = tasks.filter((task) => task.accountId === account.accountId);
  const accountLedger = ledger.filter((item) => item.accountId === account.accountId);
  const ownerIds = assignments
    .filter((assignment) => assignment.active !== false && assignment.accountId === account.accountId)
    .map((assignment) => assignment.userId);
  const feedbackDue = accountTasks.filter((task) => task.status === "feedback_due").length
    + feedback.filter((entry) => entry.accountId === account.accountId && metricsMissing(entry)).length;
  const riskTips = [];
  if (account.status && account.status !== "active") riskTips.push("账号当前不是 active。");
  if (accountTasks.some((task) => task.riskLevel === "block" || task.blockReasons?.length)) riskTips.push("存在不可批准或需改写任务。");
  if (feedbackDue > 0) riskTips.push(`有 ${feedbackDue} 条反馈欠账。`);
  if (Number(account.externalLinkLimit || 0) === 0) riskTips.push("当前账号不建议带外链。");
  return {
    accountId: account.accountId,
    handle: account.handle || "",
    persona: account.persona || account.accountId,
    niche: account.niche || "",
    status: account.status || (account.active === false ? "paused" : "active"),
    publishMode: account.publishMode || "manual",
    autoPublishEnabled: Boolean(account.autoPublishEnabled),
    requiresFinalApproval: account.requiresFinalApproval !== false,
    dailyPostLimit: Number(account.dailyPostLimit || 0),
    externalLinkLimit: Number(account.externalLinkLimit || 0),
    ownerStaff: ownerIds.map((userId) => staffNames.get(userId) || userId),
    todayTasks: accountTasks.length,
    todayPublished: accountLedger.length,
    feedbackDue,
    riskTips
  };
}

function staffConsoleView(user, { assignments = [], accountNames = new Map(), tasks = [], ledger = [] } = {}) {
  const assignedAccounts = assignments
    .filter((assignment) => assignment.active !== false && assignment.userId === user.userId)
    .map((assignment) => assignment.accountId);
  const staffTasks = tasks.filter((task) => task.assignedTo === user.userId);
  const published = ledger.filter((item) => item.employeeId === user.userId || item.assignedTo === user.userId).length;
  const skipped = staffTasks.filter((task) => task.status === "skipped").length;
  const feedbackDue = staffTasks.filter((task) => task.status === "feedback_due").length;
  const complete = staffTasks.filter((task) => ["copied", "feedback_due", "posted", "skipped"].includes(task.status)).length;
  return {
    ...userView(user),
    assignedAccounts,
    assignedAccountNames: assignedAccounts.map((accountId) => accountNames.get(accountId) || accountId),
    todayTasks: staffTasks.length,
    published,
    feedbackDue,
    skipped,
    completionRate: staffTasks.length ? Math.round((complete / staffTasks.length) * 100) : 0,
    overload: staffTasks.length > 12
  };
}

function assignmentView(assignment) {
  return {
    workspaceId: assignment.workspaceId || "workspace_default",
    accountId: assignment.accountId || "",
    userId: assignment.userId || "",
    active: assignment.active !== false
  };
}

function managerPublishJobView(job, { accountNames = new Map() } = {}) {
  return {
    jobId: job.jobId || "",
    taskId: job.taskId || "",
    workspaceId: job.workspaceId || "workspace_default",
    accountId: job.accountId || "",
    accountName: accountNames.get(job.accountId) || job.accountId || "Unknown account",
    publishMode: job.publishMode || "manual",
    status: job.status || "queued",
    scheduledAt: job.scheduledAt || "",
    safety: safePublicObject(job.safety),
    duplicateCheckResult: safePublicObject(job.duplicateCheckResult),
    blockedReason: job.error || job.safety?.flags?.[0]?.message || "",
    attemptsCount: Number(job.attemptsCount || job.attempts?.length || 0),
    lastCheckedAt: job.lastCheckedAt || "",
    postedUrl: job.postedUrl || ""
  };
}

function managerLaneView({ laneId, lane, rawCandidates = [], tasks = [] }) {
  const candidates = rawCandidates.filter((candidate) => (candidate.laneIds ?? []).includes(laneId));
  const laneTasks = tasks.filter((task) => task.laneId === laneId);
  const riskCount = candidates.filter((candidate) => (candidate.riskFlags ?? []).some((flag) => flag.severity === "block")).length
    + laneTasks.filter((task) => task.riskLevel === "block" || task.blockReasons?.length).length;
  return {
    laneId,
    name: lane?.name || laneId,
    enabled: true,
    monthlyQuota: 0,
    usedThisMonth: laneTasks.length,
    candidateCount: candidates.length,
    taskCount: laneTasks.length,
    riskCount,
    defaultStyle: lane?.defaultStyle || "",
    blockedTopics: lane?.blockedTopics ?? []
  };
}

function buildFeedbackDebt({ tasks = [], ledger = [], feedback = [], accountNames = new Map(), staffNames = new Map() }) {
  const feedbackByTask = new Map(feedback.map((entry) => [entry.taskId, entry]));
  const debt = [];
  for (const task of tasks) {
    if (task.status !== "feedback_due" && !task.postedAt) continue;
    const entry = feedbackByTask.get(task.taskId);
    if (entry && !metricsMissing(entry)) continue;
    debt.push({
      taskId: task.taskId,
      accountId: task.accountId || "",
      accountName: accountNames.get(task.accountId) || task.accountName || task.accountId || "",
      staffId: task.assignedTo || "",
      staffName: staffNames.get(task.assignedTo) || task.assignedTo || "",
      postedUrl: task.postedUrl || "",
      postedAt: task.postedAt || "",
      dueAt: task.feedbackDueAt || task.postedAt || "",
      missingMetrics: missingMetrics(entry),
      daysOverdue: daysSince(task.feedbackDueAt || task.postedAt || "")
    });
  }
  for (const item of ledger) {
    if (debt.some((row) => row.taskId === item.taskId)) continue;
    const entry = feedbackByTask.get(item.taskId);
    if (entry && !metricsMissing(entry)) continue;
    debt.push({
      taskId: item.taskId || "",
      accountId: item.accountId || "",
      accountName: accountNames.get(item.accountId) || item.accountId || "",
      staffId: item.employeeId || "",
      staffName: staffNames.get(item.employeeId) || item.employeeId || "",
      postedUrl: item.postedUrl || "",
      postedAt: item.postedAt || "",
      dueAt: item.postedAt || "",
      missingMetrics: missingMetrics(entry),
      daysOverdue: daysSince(item.postedAt || "")
    });
  }
  return debt.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

function buildManagerRisks({ tasks = [], accounts = [], publishJobs = [], feedbackDebt = [], lanes = [] }) {
  const risks = [];
  const push = (severity, type, label, count, detail) => {
    if (count > 0) risks.push({ severity, type, label, count, detail });
  };
  push("block", "duplicate_copy", "重复文案风险", tasks.filter((task) => task.duplicateCheckResult?.riskLevel === "block").length, "这些任务需要改写或拒绝。");
  push("warn", "same_tool_7d", "同账号 7 天重复工具", tasks.filter((task) => (task.duplicateCheckResult?.flags ?? []).some((flag) => String(flag.type || "").includes("same_account_same_tool"))).length, "同一账号短期不要重复推同一个工具。");
  push("warn", "domain_overuse", "同 domain 使用过多", tasks.filter((task) => (task.duplicateCheckResult?.flags ?? []).some((flag) => String(flag.type || "").includes("domain"))).length, "同一个域名出现太频繁会像广告流。");
  push("warn", "external_links", "外链过多", tasks.filter((task) => task.linkPolicy === "external_link" || task.externalLinks?.length).length, "外链内容要控制频率。");
  push("block", "account_status", "账号状态异常", accounts.filter((account) => account.status !== "active").length, "暂停账号不应该继续派发任务。");
  push("warn", "pending_review", "任务未审核", tasks.filter((task) => task.approvalStatus === "pending" || task.status === "pending_review").length, "员工执行前需要主管确认。");
  push("block", "over_280", "超 280 字符", tasks.filter((task) => !task.fitsTweetLimit).length, "自动/手动发布前必须压缩。");
  push("block", "publish_blocked", "发布队列 blocked", publishJobs.filter((job) => job.status === "blocked" || job.status === "failed").length, "需要查看 safety result。");
  push("warn", "feedback_debt", "反馈欠账过多", feedbackDebt.length, "没有回填 X Analytics，系统无法学习。");
  push("warn", "lane_risk", "内容线风险候选", lanes.reduce((sum, lane) => sum + Number(lane.riskCount || 0), 0), "尤其注意 Crypto lane 的风险主题。");
  return risks;
}

function buildManagerOverview({ tasks = [], accounts = [], staff = [], ledger = [], publishJobs = [], feedbackDebt = [], risks = [] }) {
  const total = tasks.length;
  const completed = tasks.filter((task) => ["copied", "feedback_due", "posted", "skipped"].includes(task.status)).length;
  return {
    totalTasks: total,
    pendingReview: tasks.filter((task) => task.approvalStatus === "pending" || task.status === "pending_review").length,
    approved: tasks.filter((task) => task.approvalStatus === "approved").length,
    assigned: tasks.filter((task) => task.accountId && task.assignedTo).length,
    copied: tasks.filter((task) => task.status === "copied").length,
    published: ledger.length,
    feedbackDue: feedbackDebt.length,
    skipped: tasks.filter((task) => task.status === "skipped").length,
    blocked: risks.filter((risk) => risk.severity === "block").reduce((sum, risk) => sum + risk.count, 0),
    publishQueue: {
      total: publishJobs.length,
      blocked: publishJobs.filter((job) => job.status === "blocked" || job.status === "failed").length,
      ready: publishJobs.filter((job) => job.status === "ready").length
    },
    staffCompletionRate: staff.length ? Math.round(staff.reduce((sum, user) => sum + user.completionRate, 0) / staff.length) : 0,
    accountPosting: accounts.map((account) => ({
      accountId: account.accountId,
      persona: account.persona,
      todayTasks: account.todayTasks,
      todayPublished: account.todayPublished,
      feedbackDue: account.feedbackDue
    })),
    completionRate: total ? Math.round((completed / total) * 100) : 0
  };
}

function managerSettingsView(workspace, enabledLaneIds) {
  return {
    workspaceId: workspace.workspaceId,
    name: workspace.name || workspace.workspaceId,
    plan: workspace.plan || "",
    accountLimit: Number(workspace.accountLimit || 0),
    enabledLaneIds,
    publishMode: workspace.publishMode || "manual",
    autoPublishEnabled: Boolean(workspace.autoPublishEnabled),
    requiresFinalApproval: workspace.requiresFinalApproval !== false,
    notice: "如需修改数据源或全局发布策略，请联系平台管理员。"
  };
}

function requireManagerWorkspace({ input, workspaces = [], users = [] }) {
  const activeWorkspaces = workspaces.filter((workspace) => workspace.active !== false);
  const workspace = resolveWorkspace(input?.workspaceId || "", activeWorkspaces);
  const activeUsers = users.filter((user) => user.active !== false);
  const manager = resolveManager(input?.managerUserId || "", workspace, activeUsers);
  if (!managerCanAccessWorkspace(manager, workspace)) {
    throw new Error("当前主管无权操作这个 workspace。");
  }
  return workspace;
}

function safePublishMode(value) {
  const mode = String(value || "").trim();
  if (!["manual", "scheduled", "auto"].includes(mode)) throw new Error("publishMode must be manual, scheduled, or auto");
  return mode;
}

function safeAccountStatus(value) {
  const status = String(value || "").trim();
  if (!["active", "paused", "archived"].includes(status)) throw new Error("status must be active, paused, or archived");
  return status;
}

function safeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative number`);
  return number;
}

function safePublicObject(value) {
  if (!value || typeof value !== "object") return {};
  const json = JSON.stringify(value, (key, current) => {
    if (/token|secret|key/i.test(key)) return undefined;
    return current;
  });
  return JSON.parse(json);
}

function metricsMissing(entry) {
  if (!entry) return true;
  return missingMetrics(entry).length > 0;
}

function missingMetrics(entry) {
  if (!entry) return ["impressions", "likes", "bookmarks", "clicks"];
  return ["impressions", "likes", "bookmarks", "clicks"].filter((field) => entry[field] === undefined || entry[field] === null || entry[field] === "");
}

function daysSince(dateText) {
  if (!dateText) return 0;
  const time = new Date(dateText).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
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
