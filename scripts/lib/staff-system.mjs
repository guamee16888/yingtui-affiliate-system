import { CORE_COLLECTIONS, loadCollection, saveCollection } from "./core-data.mjs";
import { createLedgerId, todayString } from "./ids.mjs";
import { SOURCE_LANE_FILES } from "./source-lanes.mjs";
import { hashText } from "./text-normalizer.mjs";
import { analyzeTweetLength, assertTweetLength } from "./tweet-length.mjs";

const STAFF_VISIBLE_STATUSES = new Set([
  "approved",
  "assigned",
  "copied",
  "feedback_due"
]);

export async function loadStaffSummary(options = "") {
  const opts = typeof options === "string" ? { userId: options } : (options ?? {});
  const [workspaces, users, xAccounts, assignments, postTasks, postLedger] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger)
  ]);
  return buildStaffSummary({
    workspaceId: opts.workspaceId || "",
    userId: opts.userId || "",
    workspaces: workspaces.items,
    users: users.items,
    xAccounts: xAccounts.items,
    assignments: assignments.items,
    tasks: postTasks.items,
    ledger: postLedger.items
  });
}

export async function updateStaffTaskAction(input) {
  const [workspaces, users, xAccounts, assignments, postTasks, postLedger] = await Promise.all([
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger)
  ]);
  const result = applyStaffTaskAction({
    input,
    workspaces: workspaces.items,
    users: users.items,
    xAccounts: xAccounts.items,
    assignments: assignments.items,
    tasks: postTasks.items,
    ledger: postLedger.items
  });
  await Promise.all([
    saveCollection(CORE_COLLECTIONS.postTasks, { ...postTasks, items: result.tasks }),
    saveCollection(CORE_COLLECTIONS.postLedger, { ...postLedger, items: result.ledger })
  ]);
  return {
    task: result.task,
    summary: buildStaffSummary({
      workspaceId: result.workspace.workspaceId,
      userId: result.user.userId,
      workspaces: workspaces.items,
      users: users.items,
      xAccounts: xAccounts.items,
      assignments: assignments.items,
      tasks: result.tasks,
      ledger: result.ledger
    })
  };
}

export function buildStaffSummary({ workspaceId = "", userId = "", workspaces = [], users = [], xAccounts = [], assignments = [], tasks = [], ledger = [] }) {
  const activeUsers = users.filter((user) => user.active !== false);
  const selectedUser = resolveStaffUser(userId, activeUsers);
  const selectedWorkspace = resolveStaffWorkspace(workspaceId, selectedUser, workspaces, assignments, xAccounts);
  const accessAllowed = staffCanAccessWorkspace(selectedUser, selectedWorkspace, assignments, xAccounts);
  const assignedAccountIds = new Set(assignments
    .filter((assignment) => assignment.active !== false && assignment.userId === selectedUser?.userId)
    .filter((assignment) => assignmentWorkspaceId(assignment, xAccounts) === selectedWorkspace?.workspaceId)
    .map((assignment) => assignment.accountId));
  const accounts = xAccounts
    .filter((account) => accessAllowed && assignedAccountIds.has(account.accountId) && accountWorkspaceId(account) === selectedWorkspace.workspaceId)
    .map((account) => ({
      accountId: account.accountId,
      workspaceId: accountWorkspaceId(account),
      handle: account.handle || "",
      niche: account.niche || "",
      persona: account.persona || "",
      status: account.status || (account.active === false ? "paused" : "active"),
      dailyPostLimit: Number(account.dailyPostLimit || 0),
      externalLinkLimit: Number(account.externalLinkLimit || 0)
    }));
  const accountNames = new Map(accounts.map((account) => [account.accountId, account.persona || account.accountId]));
  const visibleTasks = accessAllowed ? tasks
    .filter((task) => taskWorkspaceId(task) === selectedWorkspace.workspaceId)
    .filter((task) => task.assignedTo === selectedUser?.userId)
    .filter((task) => STAFF_VISIBLE_STATUSES.has(task.status) || (task.date === todayString() && task.approvalStatus === "approved"))
    .map((task) => staffTaskView(task, { accountNames, ledger }))
    .sort(staffTaskSort) : [];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    selectedWorkspace: selectedWorkspace ? {
      workspaceId: selectedWorkspace.workspaceId,
      name: selectedWorkspace.name || selectedWorkspace.workspaceId,
      plan: selectedWorkspace.plan || "",
      enabledLaneIds: selectedWorkspace.enabledLaneIds ?? []
    } : null,
    selectedUser: selectedUser ? {
      userId: selectedUser.userId,
      name: selectedUser.name || selectedUser.userId,
      role: selectedUser.role || "staff",
      workspaceId: selectedUser.workspaceId || selectedWorkspace?.workspaceId || ""
    } : null,
    accessAllowed,
    accessError: accessAllowed ? "" : "Selected user is not allowed to view this workspace.",
    users: activeUsers.filter((user) => staffCanAccessWorkspace(user, selectedWorkspace, assignments, xAccounts)).map((user) => ({
      userId: user.userId,
      name: user.name || user.userId,
      role: user.role || "staff",
      workspaceId: user.workspaceId || ""
    })),
    accounts,
    summary: summarizeStaffTasks(visibleTasks, accounts),
    tasks: visibleTasks
  };
}

export function applyStaffTaskAction({ input, workspaces = [], users = [], xAccounts = [], assignments = [], tasks = [], ledger = [], now = new Date() }) {
  const action = String(input?.action || "").trim();
  if (!["copy", "posted", "skip"].includes(action)) throw new Error("action must be copy, posted, or skip");
  const taskId = String(input?.taskId || "").trim();
  if (!taskId) throw new Error("taskId is required");
  const activeUsers = users.filter((user) => user.active !== false);
  const user = resolveStaffUser(input?.userId, activeUsers);
  if (!user) throw new Error("staff user is required");
  const task = tasks.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  const workspace = resolveStaffWorkspace(input?.workspaceId || taskWorkspaceId(task), user, workspaces, assignments, xAccounts);
  if (!staffCanAccessWorkspace(user, workspace, assignments, xAccounts)) {
    throw new Error("Selected user is not allowed to view this workspace.");
  }
  if (taskWorkspaceId(task) !== workspace.workspaceId) {
    throw new Error("This task does not belong to the selected workspace.");
  }
  if (task.assignedTo !== user.userId) {
    throw new Error("This task is not assigned to the selected staff user.");
  }
  const account = xAccounts.find((item) => item.accountId === task.accountId);
  if (account && accountWorkspaceId(account) !== workspace.workspaceId) {
    throw new Error("This task account does not belong to the selected workspace.");
  }
  const assignedAccountIds = new Set(assignments
    .filter((assignment) => assignment.active !== false && assignment.userId === user.userId)
    .filter((assignment) => assignmentWorkspaceId(assignment, xAccounts) === workspace.workspaceId)
    .map((assignment) => assignment.accountId));
  if (task.accountId && !assignedAccountIds.has(task.accountId)) {
    throw new Error("This task is not assigned to the selected staff user.");
  }
  if (action !== "skip") {
    assertTaskCanMove(task);
    assertTweetLength(task.copyText);
  }

  const nextTask = applyActionToTask(task, { action, input, user, now });
  const nextTasks = tasks.map((item) => item.taskId === task.taskId ? nextTask : item);
  const nextLedger = action === "posted"
    ? upsertStaffLedger({ ledger, task: nextTask, user, xAccounts, now })
    : ledger;

  return { workspace, user, task: nextTask, tasks: nextTasks, ledger: nextLedger };
}

function resolveStaffUser(userId, users) {
  const requested = String(userId || "").trim();
  return users.find((user) => user.userId === requested)
    ?? users.find((user) => user.role === "staff")
    ?? users[0]
    ?? null;
}

function resolveStaffWorkspace(workspaceId, user, workspaces, assignments, xAccounts) {
  const activeWorkspaces = workspaces.filter((workspace) => workspace.active !== false && workspace.status !== "archived");
  const requested = String(workspaceId || "").trim();
  if (requested) {
    return activeWorkspaces.find((workspace) => workspace.workspaceId === requested)
      ?? (requested === "workspace_default" ? defaultWorkspaceFallback() : null);
  }
  if (user?.workspaceId) {
    const workspace = activeWorkspaces.find((item) => item.workspaceId === user.workspaceId);
    if (workspace) return workspace;
  }
  const assignment = assignments.find((item) => item.active !== false && item.userId === user?.userId);
  if (assignment) {
    const inferred = assignmentWorkspaceId(assignment, xAccounts);
    const workspace = activeWorkspaces.find((item) => item.workspaceId === inferred);
    if (workspace) return workspace;
  }
  return activeWorkspaces.find((workspace) => workspace.workspaceId === "workspace_default")
    ?? activeWorkspaces[0]
    ?? defaultWorkspaceFallback();
}

function defaultWorkspaceFallback() {
  return {
    workspaceId: "workspace_default",
    name: "Default Workspace",
    managerUserIds: [],
    staffUserIds: [],
    enabledLaneIds: []
  };
}

function staffCanAccessWorkspace(user, workspace, assignments, xAccounts) {
  if (!user || !workspace) return false;
  if ((workspace.staffUserIds ?? []).includes(user.userId)) return true;
  if ((workspace.managerUserIds ?? []).includes(user.userId)) return true;
  if (user.workspaceId && user.workspaceId === workspace.workspaceId) return true;
  return assignments.some((assignment) => assignment.active !== false
    && assignment.userId === user.userId
    && assignmentWorkspaceId(assignment, xAccounts) === workspace.workspaceId);
}

function assignmentWorkspaceId(assignment, xAccounts) {
  return assignment.workspaceId
    || xAccounts.find((account) => account.accountId === assignment.accountId)?.workspaceId
    || "workspace_default";
}

function accountWorkspaceId(account) {
  return account.workspaceId || "workspace_default";
}

function taskWorkspaceId(task) {
  return task.workspaceId || "workspace_default";
}

function staffTaskView(task, { accountNames, ledger }) {
  const length = analyzeTweetLength(task.copyText || "");
  const postedLedger = ledger.find((item) => item.taskId === task.taskId);
  const riskLevel = task.duplicateCheckResult?.riskLevel || (task.riskFlags?.length ? "medium" : "low");
  const blockReasons = [
    ...(length.fitsXPost ? [] : [`Over 280 weighted characters (${length.weightedCharCount}).`]),
    ...(riskLevel === "block" ? (task.duplicateCheckResult?.flags ?? []).map((flag) => flag.message || flag.type) : []),
    ...(task.approvalStatus === "rejected" ? ["Task was rejected."] : []),
    ...(task.approvalStatus !== "approved" ? ["Task is waiting for manager approval."] : [])
  ];
  const publishMode = task.publishMode || "manual";
  const systemManaged = ["scheduled", "auto"].includes(publishMode) || Boolean(task.autoPublishEnabled);

  return {
    taskId: task.taskId,
    date: task.date || "",
    workspaceId: taskWorkspaceId(task),
    laneId: task.laneId || "",
    sourceCandidateId: task.sourceCandidateId || "",
    accountId: task.accountId || "",
    accountName: accountNames.get(task.accountId) || task.accountId || "Unassigned account",
    assignedTo: task.assignedTo || "",
    toolId: task.toolId || "",
    toolName: task.toolName || task.toolId || "Untitled task",
    toolUrl: task.toolUrl || "",
    topicId: task.topicId || "",
    copyId: task.copyId || "",
    variantType: task.variantType || "shortPost",
    copyText: task.copyText || "",
    status: task.status || "draft",
    approvalStatus: task.approvalStatus || "pending",
    publishMode,
    autoPublishEnabled: Boolean(task.autoPublishEnabled),
    requiresFinalApproval: task.requiresFinalApproval !== false,
    scheduledAt: task.scheduledAt || task.publishWindow || "",
    notBefore: task.notBefore || "",
    systemManaged,
    postedAt: task.postedAt || postedLedger?.postedAt || "",
    postedUrl: task.postedUrl || postedLedger?.postedUrl || "",
    copiedAt: task.copiedAt || "",
    feedbackDueAt: task.feedbackDueAt || "",
    riskLevel,
    riskFlags: task.riskFlags ?? [],
    duplicateFlags: task.duplicateCheckResult?.flags ?? [],
    externalLinks: task.externalLinks ?? [],
    affiliateLinkUsed: task.affiliateLinkUsed || "",
    notes: task.notes || "",
    tweetLength: length,
    canCopy: !systemManaged && blockReasons.length === 0 && !["feedback_due", "posted", "skipped"].includes(task.status),
    canMarkPosted: !systemManaged && blockReasons.length === 0 && !["feedback_due", "posted", "skipped"].includes(task.status),
    canSkip: !["feedback_due", "posted", "skipped"].includes(task.status),
    blockReasons
  };
}

function summarizeStaffTasks(tasks, accounts) {
  const ready = tasks.filter((task) => task.canCopy).length;
  const copied = tasks.filter((task) => task.status === "copied").length;
  const feedbackDue = tasks.filter((task) => task.status === "feedback_due").length;
  const overLimit = tasks.filter((task) => !task.tweetLength.fitsXPost).length;
  const blocked = tasks.filter((task) => task.riskLevel === "block" || task.approvalStatus === "rejected").length;
  return {
    accounts: accounts.length,
    totalTasks: tasks.length,
    ready,
    copied,
    feedbackDue,
    overLimit,
    blocked,
    today: tasks.filter((task) => task.date === todayString()).length
  };
}

function staffTaskSort(a, b) {
  const statusRank = { copied: 0, pending_review: 1, approved: 1, assigned: 1, feedback_due: 2, draft: 3, skipped: 4 };
  return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
    || Number(a.tweetLength.weightedCharCount) - Number(b.tweetLength.weightedCharCount)
    || a.accountName.localeCompare(b.accountName)
    || a.toolName.localeCompare(b.toolName);
}

function assertTaskCanMove(task) {
  if (task.duplicateCheckResult?.riskLevel === "block") {
    const reason = task.duplicateCheckResult.flags?.[0]?.message || "Duplicate checker blocked this task.";
    throw new Error(reason);
  }
  if (task.approvalStatus === "rejected") throw new Error("Rejected tasks cannot be copied or posted.");
  if (task.approvalStatus !== "approved") throw new Error("Task is waiting for manager approval.");
  if (["feedback_due", "posted"].includes(task.status)) throw new Error("This task is already marked as posted.");
}

function applyActionToTask(task, { action, input, user, now }) {
  const timestamp = now.toISOString();
  const common = {
    ...task,
    approvalStatus: action === "skip" ? "rejected" : "approved",
    updatedAt: timestamp
  };
  if (action === "copy") {
    return {
      ...common,
      status: "copied",
      copiedAt: timestamp,
      notes: appendNote(task.notes, `Copied by ${user.name || user.userId} from staff workspace.`)
    };
  }
  if (action === "posted") {
    return {
      ...common,
      status: "feedback_due",
      copiedAt: task.copiedAt || timestamp,
      postedAt: input.postedAt || timestamp,
      postedUrl: input.postedUrl || task.postedUrl || "",
      feedbackDueAt: input.feedbackDueAt || timestamp,
      notes: appendNote(task.notes, `Manually marked posted by ${user.name || user.userId} from staff workspace.`)
    };
  }
  return {
    ...common,
    status: "skipped",
    notes: appendNote(task.notes, input.reason || `Skipped by ${user.name || user.userId} from staff workspace.`)
  };
}

function upsertStaffLedger({ ledger, task, user, xAccounts, now }) {
  const postedUrl = task.postedUrl || "";
  const ledgerId = createLedgerId(task.taskId, postedUrl || "manual");
  const account = xAccounts.find((item) => item.accountId === task.accountId);
  const record = {
    ledgerId,
    taskId: task.taskId,
    workspaceId: taskWorkspaceId(task),
    accountId: task.accountId || "",
    employeeId: user.userId,
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
    notes: account?.persona ? `Staff manual post for ${account.persona}` : "Staff manual post",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return [
    ...ledger.filter((item) => item.ledgerId !== ledgerId && item.taskId !== task.taskId),
    record
  ];
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
