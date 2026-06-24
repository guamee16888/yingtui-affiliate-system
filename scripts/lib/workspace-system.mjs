import { CORE_COLLECTIONS, emptyCollection, loadCollection, normalizeCollection, saveCollection, withUpdatedAt } from "./core-data.mjs";
import { loadFeedback, saveFeedback } from "./storage/interface.mjs";
import { PUBLISH_FILES, loadPublishCollection, savePublishCollection } from "./publish-data.mjs";
import { buildSourceLaneSeed, loadSourceLaneData, saveSourceLaneData, workspaceLaneIds } from "./source-lanes.mjs";

export const DEFAULT_WORKSPACE_ID = "workspace_default";

export async function migrateWorkspaceData() {
  const sourceData = await loadSourceLaneData();
  const seeded = buildSourceLaneSeed(sourceData).next;
  const [core, publish, feedback] = await Promise.all([
    loadWorkspaceCore(),
    loadWorkspacePublish(),
    loadFeedback()
  ]);
  const result = buildWorkspaceMigration({
    sourceData: seeded,
    core,
    publish,
    feedback
  });
  await Promise.all([
    saveSourceLaneData(result.sourceData),
    saveCollection(CORE_COLLECTIONS.users, result.core.users),
    saveCollection(CORE_COLLECTIONS.xAccounts, result.core.xAccounts),
    saveCollection(CORE_COLLECTIONS.assignments, result.core.assignments),
    saveCollection(CORE_COLLECTIONS.postTasks, result.core.postTasks),
    saveCollection(CORE_COLLECTIONS.postLedger, result.core.postLedger),
    savePublishCollection(PUBLISH_FILES.publishJobs, result.publish.publishJobs),
    savePublishCollection(PUBLISH_FILES.publishAttempts, result.publish.publishAttempts),
    savePublishCollection(PUBLISH_FILES.xConnections, result.publish.xConnections),
    saveFeedback(result.feedback)
  ]);
  return result.stats;
}

export function buildWorkspaceMigration({ sourceData, core, publish, feedback, now = new Date().toISOString() }) {
  const nextSourceData = {
    ...sourceData,
    workspaces: normalizeCollection(sourceData.workspaces ?? emptyCollection()),
    workspaceLanes: normalizeCollection(sourceData.workspaceLanes ?? emptyCollection())
  };
  const nextCore = normalizeWorkspaceCore(core);
  const nextPublish = normalizeWorkspacePublish(publish);
  const nextFeedback = {
    ...feedback,
    entries: Array.isArray(feedback?.entries) ? [...feedback.entries] : []
  };
  const stats = {
    workspaces: nextSourceData.workspaces.items.length,
    usersUpdated: 0,
    accountsUpdated: 0,
    assignmentsUpdated: 0,
    tasksUpdated: 0,
    ledgerUpdated: 0,
    publishJobsUpdated: 0,
    publishAttemptsUpdated: 0,
    xConnectionsUpdated: 0,
    feedbackUpdated: 0,
    managerUserIdsAdded: 0,
    staffUserIdsAdded: 0
  };
  const defaultWorkspace = ensureDefaultWorkspace(nextSourceData.workspaces.items, now);
  const accountWorkspace = new Map();
  const userWorkspace = new Map();

  for (const account of nextCore.xAccounts.items) {
    if (!account.workspaceId) {
      account.workspaceId = DEFAULT_WORKSPACE_ID;
      account.updatedAt = now;
      stats.accountsUpdated += 1;
    }
    accountWorkspace.set(account.accountId, account.workspaceId || DEFAULT_WORKSPACE_ID);
    for (const userId of [account.ownerUserId, account.managerUserId].filter(Boolean)) {
      userWorkspace.set(userId, account.workspaceId || DEFAULT_WORKSPACE_ID);
    }
  }

  for (const assignment of nextCore.assignments.items) {
    const workspaceId = assignment.workspaceId || accountWorkspace.get(assignment.accountId) || userWorkspace.get(assignment.userId) || DEFAULT_WORKSPACE_ID;
    if (!assignment.workspaceId) {
      assignment.workspaceId = workspaceId;
      assignment.updatedAt = now;
      stats.assignmentsUpdated += 1;
    }
    accountWorkspace.set(assignment.accountId, workspaceId);
    userWorkspace.set(assignment.userId, workspaceId);
  }

  for (const user of nextCore.users.items) {
    const inferred = user.workspaceId || userWorkspace.get(user.userId) || DEFAULT_WORKSPACE_ID;
    if (!user.workspaceId) {
      user.workspaceId = inferred;
      user.updatedAt = now;
      stats.usersUpdated += 1;
    }
    userWorkspace.set(user.userId, user.workspaceId);
  }

  for (const task of nextCore.postTasks.items) {
    const workspaceId = task.workspaceId
      || accountWorkspace.get(task.accountId)
      || userWorkspace.get(task.assignedTo)
      || userWorkspace.get(task.managerUserId)
      || DEFAULT_WORKSPACE_ID;
    if (!task.workspaceId) {
      task.workspaceId = workspaceId;
      task.updatedAt = now;
      stats.tasksUpdated += 1;
    }
  }

  const taskWorkspace = new Map(nextCore.postTasks.items.map((task) => [task.taskId, task.workspaceId || DEFAULT_WORKSPACE_ID]));
  for (const record of nextCore.postLedger.items) {
    const workspaceId = record.workspaceId
      || taskWorkspace.get(record.taskId)
      || accountWorkspace.get(record.accountId)
      || userWorkspace.get(record.employeeId)
      || DEFAULT_WORKSPACE_ID;
    if (!record.workspaceId) {
      record.workspaceId = workspaceId;
      record.updatedAt = now;
      stats.ledgerUpdated += 1;
    }
  }

  for (const entry of nextFeedback.entries) {
    const workspaceId = entry.workspaceId
      || taskWorkspace.get(entry.taskId)
      || accountWorkspace.get(entry.accountId)
      || DEFAULT_WORKSPACE_ID;
    if (!entry.workspaceId) {
      entry.workspaceId = workspaceId;
      entry.updatedAt = now;
      stats.feedbackUpdated += 1;
    }
  }

  for (const job of nextPublish.publishJobs.items) {
    const workspaceId = job.workspaceId || taskWorkspace.get(job.taskId) || accountWorkspace.get(job.accountId) || DEFAULT_WORKSPACE_ID;
    if (!job.workspaceId) {
      job.workspaceId = workspaceId;
      job.updatedAt = now;
      stats.publishJobsUpdated += 1;
    }
  }
  for (const attempt of nextPublish.publishAttempts.items) {
    const workspaceId = attempt.workspaceId || taskWorkspace.get(attempt.taskId) || DEFAULT_WORKSPACE_ID;
    if (!attempt.workspaceId) {
      attempt.workspaceId = workspaceId;
      stats.publishAttemptsUpdated += 1;
    }
  }
  for (const connection of nextPublish.xConnections.items) {
    const workspaceId = connection.workspaceId || accountWorkspace.get(connection.accountId) || DEFAULT_WORKSPACE_ID;
    if (!connection.workspaceId) {
      connection.workspaceId = workspaceId;
      connection.updatedAt = now;
      stats.xConnectionsUpdated += 1;
    }
  }

  const workspaceById = new Map(nextSourceData.workspaces.items.map((workspace) => [workspace.workspaceId, workspace]));
  for (const workspace of workspaceById.values()) {
    workspace.managerUserIds = [...new Set(workspace.managerUserIds ?? [])];
    workspace.staffUserIds = [...new Set(workspace.staffUserIds ?? [])];
  }
  for (const account of nextCore.xAccounts.items) {
    const workspace = workspaceById.get(account.workspaceId) || defaultWorkspace;
    for (const userId of [account.ownerUserId, account.managerUserId].filter(Boolean)) {
      if (!workspace.managerUserIds.includes(userId)) {
        workspace.managerUserIds.push(userId);
        stats.managerUserIdsAdded += 1;
      }
    }
  }
  for (const assignment of nextCore.assignments.items) {
    if (assignment.active === false) continue;
    const workspace = workspaceById.get(assignment.workspaceId) || defaultWorkspace;
    if (assignment.userId && !workspace.staffUserIds.includes(assignment.userId)) {
      workspace.staffUserIds.push(assignment.userId);
      stats.staffUserIdsAdded += 1;
    }
  }
  for (const user of nextCore.users.items) {
    const workspace = workspaceById.get(user.workspaceId) || defaultWorkspace;
    if (["admin", "manager"].includes(user.role) && !workspace.managerUserIds.includes(user.userId)) {
      workspace.managerUserIds.push(user.userId);
      stats.managerUserIdsAdded += 1;
    }
    if (!["admin", "manager"].includes(user.role) && !workspace.staffUserIds.includes(user.userId)) {
      workspace.staffUserIds.push(user.userId);
      stats.staffUserIdsAdded += 1;
    }
  }
  for (const workspace of nextSourceData.workspaces.items) {
    workspace.updatedAt = now;
  }

  return {
    sourceData: {
      ...nextSourceData,
      workspaces: withUpdatedAt(nextSourceData.workspaces)
    },
    core: nextCore,
    publish: nextPublish,
    feedback: nextFeedback,
    stats
  };
}

export async function loadWorkspaceSummary() {
  const [sourceData, core, publish, feedback] = await Promise.all([
    loadSourceLaneData(),
    loadWorkspaceCore(),
    loadWorkspacePublish(),
    loadFeedback()
  ]);
  return buildWorkspaceSummary({ sourceData, core, publish, feedback });
}

export function buildWorkspaceSummary({ sourceData, core, publish, feedback }) {
  const workspaces = normalizeCollection(sourceData.workspaces ?? emptyCollection()).items;
  const workspaceLanes = normalizeCollection(sourceData.workspaceLanes ?? emptyCollection()).items;
  const normalizedCore = normalizeWorkspaceCore(core);
  const normalizedPublish = normalizeWorkspacePublish(publish);
  const entries = Array.isArray(feedback?.entries) ? feedback.entries : [];
  const workspaceStats = workspaces.map((workspace) => {
    const workspaceId = workspace.workspaceId;
    const accounts = normalizedCore.xAccounts.items.filter((account) => (account.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId);
    const users = normalizedCore.users.items.filter((user) => (user.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId);
    const managerIds = new Set(workspace.managerUserIds ?? []);
    const staffIds = new Set(workspace.staffUserIds ?? []);
    const managerCount = users.filter((user) => managerIds.has(user.userId) || ["admin", "manager"].includes(user.role)).length;
    const staffCount = users.filter((user) => staffIds.has(user.userId) && !["admin", "manager"].includes(user.role)).length;
    const tasks = normalizedCore.postTasks.items.filter((task) => (task.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId);
    const ledger = normalizedCore.postLedger.items.filter((item) => (item.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId);
    const publishJobs = normalizedPublish.publishJobs.items.filter((job) => (job.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId);
    return {
      workspaceId,
      name: workspace.name || workspaceId,
      plan: workspace.plan || "",
      status: workspace.status || (workspace.active === false ? "paused" : "active"),
      accountLimit: Number(workspace.accountLimit || 0),
      managerUserIds: workspace.managerUserIds ?? [],
      staffUserIds: workspace.staffUserIds ?? [],
      enabledLaneIds: workspaceLaneIds(workspace, workspaceLanes),
      accounts: accounts.length,
      users: users.length,
      managers: managerCount,
      staff: staffCount,
      tasks: tasks.length,
      publishJobs: publishJobs.length,
      ledger: ledger.length,
      feedback: entries.filter((entry) => (entry.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId).length,
      overAccountLimit: Boolean(workspace.accountLimit && accounts.length > Number(workspace.accountLimit))
    };
  });
  const knownWorkspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      workspaces: workspaces.length,
      activeWorkspaces: workspaces.filter((workspace) => workspace.active !== false && workspace.status !== "archived").length,
      accounts: normalizedCore.xAccounts.items.length,
      users: normalizedCore.users.items.length,
      tasks: normalizedCore.postTasks.items.length,
      publishJobs: normalizedPublish.publishJobs.items.length,
      missingUserWorkspace: normalizedCore.users.items.filter((user) => !user.workspaceId).length,
      missingAccountWorkspace: normalizedCore.xAccounts.items.filter((account) => !account.workspaceId).length,
      missingTaskWorkspace: normalizedCore.postTasks.items.filter((task) => !task.workspaceId).length,
      missingPublishJobWorkspace: normalizedPublish.publishJobs.items.filter((job) => !job.workspaceId).length,
      missingLedgerWorkspace: normalizedCore.postLedger.items.filter((item) => !item.workspaceId).length,
      overAccountLimit: workspaceStats.filter((workspace) => workspace.overAccountLimit).length,
      unknownWorkspaceRefs: unknownWorkspaceRefs({ core: normalizedCore, publish: normalizedPublish, knownWorkspaceIds }).length
    },
    workspaces: workspaceStats,
    usersWithoutWorkspace: normalizedCore.users.items.filter((user) => !user.workspaceId).map((user) => user.userId),
    accountsWithoutWorkspace: normalizedCore.xAccounts.items.filter((account) => !account.workspaceId).map((account) => account.accountId),
    tasksWithoutWorkspace: normalizedCore.postTasks.items.filter((task) => !task.workspaceId).map((task) => task.taskId),
    publishJobsWithoutWorkspace: normalizedPublish.publishJobs.items.filter((job) => !job.workspaceId).map((job) => job.jobId),
    ledgerWithoutWorkspace: normalizedCore.postLedger.items.filter((item) => !item.workspaceId).map((item) => item.ledgerId),
    overAccountLimitWorkspaces: workspaceStats.filter((workspace) => workspace.overAccountLimit).map((workspace) => workspace.workspaceId),
    unknownWorkspaceRefs: unknownWorkspaceRefs({ core: normalizedCore, publish: normalizedPublish, knownWorkspaceIds })
  };
}

export function formatWorkspaceSummary(summary) {
  const lines = [
    "Workspace Summary",
    `- Workspaces: ${summary.summary.workspaces}`,
    `- Active workspaces: ${summary.summary.activeWorkspaces}`,
    `- Accounts: ${summary.summary.accounts}`,
    `- Users: ${summary.summary.users}`,
    `- Tasks: ${summary.summary.tasks}`,
    `- Publish jobs: ${summary.summary.publishJobs}`,
    `- Users without workspace: ${summary.summary.missingUserWorkspace}`,
    `- Accounts without workspace: ${summary.summary.missingAccountWorkspace}`,
    `- Tasks without workspace: ${summary.summary.missingTaskWorkspace}`,
    `- Publish jobs without workspace: ${summary.summary.missingPublishJobWorkspace}`,
    `- Ledger without workspace: ${summary.summary.missingLedgerWorkspace}`,
    `- Over accountLimit: ${summary.summary.overAccountLimit}`,
    "",
    "Workspaces:"
  ];
  for (const workspace of summary.workspaces) {
    lines.push(`- ${workspace.workspaceId}: ${workspace.accounts} accounts, ${workspace.staff} staff, ${workspace.managers} managers, ${workspace.tasks} tasks, lanes ${workspace.enabledLaneIds.join(", ") || "none"}`);
  }
  return lines.join("\n");
}

async function loadWorkspaceCore() {
  const [users, xAccounts, assignments, postTasks, postLedger] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger)
  ]);
  return { users, xAccounts, assignments, postTasks, postLedger };
}

async function loadWorkspacePublish() {
  const [publishJobs, publishAttempts, xConnections] = await Promise.all([
    loadPublishCollection(PUBLISH_FILES.publishJobs),
    loadPublishCollection(PUBLISH_FILES.publishAttempts),
    loadPublishCollection(PUBLISH_FILES.xConnections)
  ]);
  return { publishJobs, publishAttempts, xConnections };
}

function normalizeWorkspaceCore(core) {
  return {
    users: normalizeCollection(core.users ?? emptyCollection()),
    xAccounts: normalizeCollection(core.xAccounts ?? emptyCollection()),
    assignments: normalizeCollection(core.assignments ?? emptyCollection()),
    postTasks: normalizeCollection(core.postTasks ?? emptyCollection()),
    postLedger: normalizeCollection(core.postLedger ?? emptyCollection())
  };
}

function normalizeWorkspacePublish(publish) {
  return {
    publishJobs: normalizeCollection(publish.publishJobs ?? emptyCollection()),
    publishAttempts: normalizeCollection(publish.publishAttempts ?? emptyCollection()),
    xConnections: normalizeCollection(publish.xConnections ?? emptyCollection())
  };
}

function ensureDefaultWorkspace(workspaces, now) {
  let workspace = workspaces.find((item) => item.workspaceId === DEFAULT_WORKSPACE_ID);
  if (!workspace) {
    workspace = {
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: "Default Workspace",
      plan: "internal",
      status: "active",
      accountLimit: 30,
      managerUserIds: [],
      staffUserIds: [],
      enabledLaneIds: ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"],
      publishMode: "manual",
      autoPublishEnabled: false,
      requiresFinalApproval: true,
      createdAt: now,
      updatedAt: now,
      notes: ""
    };
    workspaces.push(workspace);
  }
  workspace.status = workspace.status || (workspace.active === false ? "paused" : "active");
  workspace.managerUserIds = workspace.managerUserIds ?? [];
  workspace.staffUserIds = workspace.staffUserIds ?? [];
  workspace.enabledLaneIds = workspace.enabledLaneIds?.length ? workspace.enabledLaneIds : ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"];
  workspace.autoPublishEnabled = Boolean(workspace.autoPublishEnabled);
  workspace.requiresFinalApproval = workspace.requiresFinalApproval !== false;
  return workspace;
}

function unknownWorkspaceRefs({ core, publish, knownWorkspaceIds }) {
  const refs = [];
  for (const account of core.xAccounts.items) addUnknown(refs, knownWorkspaceIds, account.workspaceId, "account", account.accountId);
  for (const user of core.users.items) addUnknown(refs, knownWorkspaceIds, user.workspaceId, "user", user.userId);
  for (const task of core.postTasks.items) addUnknown(refs, knownWorkspaceIds, task.workspaceId, "task", task.taskId);
  for (const job of publish.publishJobs.items) addUnknown(refs, knownWorkspaceIds, job.workspaceId, "publish_job", job.jobId);
  return refs;
}

function addUnknown(refs, knownWorkspaceIds, workspaceId, type, id) {
  if (workspaceId && !knownWorkspaceIds.has(workspaceId)) refs.push({ type, id, workspaceId });
}
