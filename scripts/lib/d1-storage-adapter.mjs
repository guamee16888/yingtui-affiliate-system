import { createStableId } from "./ids.mjs";
import { buildManagerSummary } from "./manager-system.mjs";
import { createStorageAdapter } from "./storage-adapter.mjs";

const TASK_PATCH_COLUMNS = {
  status: "status",
  approvalStatus: "approval_status",
  accountId: "account_id",
  assignedTo: "assigned_to",
  managerUserId: "manager_user_id",
  notes: "notes"
};

export function createD1StorageAdapter(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("D1 adapter requires a binding-like object with prepare(sql).");
  }

  async function getWorkspace(workspaceId) {
    const row = await first(
      db,
      `SELECT workspace_id, name, plan, account_limit, publish_mode, auto_publish_enabled,
        requires_final_approval, status, created_at, updated_at
       FROM workspaces
       WHERE workspace_id = ?`,
      [workspaceId]
    );
    if (!row) return null;
    const workspace = workspaceFromRow(row);
    workspace.enabledLaneIds = await listWorkspaceLaneIds(db, workspaceId);
    return workspace;
  }

  async function listWorkspaceTasks(workspaceId, filters = {}) {
    const clauses = ["workspace_id = ?"];
    const params = [workspaceId];
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.accountId) {
      clauses.push("account_id = ?");
      params.push(filters.accountId);
    }
    const rows = await all(
      db,
      `SELECT post_tasks.*, tools.canonical_name AS tool_name, tools.url AS tool_url,
        topics.lane_id AS lane_id, copy_library.variant_type AS variant_type
       FROM post_tasks
       LEFT JOIN tools ON tools.tool_id = post_tasks.tool_id
       LEFT JOIN topics ON topics.topic_id = post_tasks.topic_id
       LEFT JOIN copy_library ON copy_library.copy_id = post_tasks.copy_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY post_tasks.created_at DESC, post_tasks.task_id ASC`,
      params
    );
    return rows.map(taskFromRow);
  }

  async function listStaffTasks(workspaceId, userId, filters = {}) {
    const clauses = ["workspace_id = ?", "assigned_to = ?"];
    const params = [workspaceId, userId];
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    const rows = await all(
      db,
      `SELECT post_tasks.*, tools.canonical_name AS tool_name, tools.url AS tool_url,
        topics.lane_id AS lane_id, copy_library.variant_type AS variant_type
       FROM post_tasks
       LEFT JOIN tools ON tools.tool_id = post_tasks.tool_id
       LEFT JOIN topics ON topics.topic_id = post_tasks.topic_id
       LEFT JOIN copy_library ON copy_library.copy_id = post_tasks.copy_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY post_tasks.created_at DESC, post_tasks.task_id ASC`,
      params
    );
    return rows.map(taskFromRow);
  }

  async function loadAuthCollections() {
    const data = await loadD1Collections();
    return {
      users: data.users,
      workspaces: data.workspaces,
      assignments: data.assignments,
      xAccounts: data.xAccounts
    };
  }

  async function loadManagerSummary({ workspaceId = "", managerUserId = "" } = {}) {
    const data = await loadD1Collections();
    return buildManagerSummary({
      workspaceId,
      managerUserId,
      workspaces: data.workspaces,
      users: data.users,
      xAccounts: data.xAccounts,
      assignments: data.assignments,
      tasks: data.tasks,
      ledger: data.ledger,
      publishJobs: data.publishJobs,
      feedback: data.feedback
    });
  }

  async function updateTaskStatus(workspaceId, taskId, patch = {}, actor = {}) {
    const current = await first(db, "SELECT * FROM post_tasks WHERE workspace_id = ? AND task_id = ?", [workspaceId, taskId]);
    if (!current) throw new Error(`Task not found in workspace: ${taskId}`);

    const now = new Date().toISOString();
    const updates = [];
    const params = [];
    for (const [key, column] of Object.entries(TASK_PATCH_COLUMNS)) {
      if (Object.hasOwn(patch, key)) {
        updates.push(`${column} = ?`);
        params.push(String(patch[key] ?? ""));
      }
    }
    updates.push("updated_at = ?");
    params.push(now, workspaceId, taskId);

    await run(db, `UPDATE post_tasks SET ${updates.join(", ")} WHERE workspace_id = ? AND task_id = ?`, params);
    await writeAuditLog({
      workspaceId,
      actorUserId: actor.userId || "",
      actorRole: actor.role || "system",
      action: patch.status ? `task.${patch.status}` : "task.update",
      entityType: "post_task",
      entityId: taskId,
      metadata: { patch: publicPatch(patch) }
    });

    const next = await first(db, "SELECT * FROM post_tasks WHERE workspace_id = ? AND task_id = ?", [workspaceId, taskId]);
    return taskFromRow(next);
  }

  async function appendLedgerEntry(workspaceId, ledgerEntry = {}, actor = {}) {
    if (!ledgerEntry.taskId) throw new Error("Ledger entry requires taskId.");
    const task = await first(db, "SELECT * FROM post_tasks WHERE workspace_id = ? AND task_id = ?", [workspaceId, ledgerEntry.taskId]);
    if (!task) throw new Error(`Task not found in workspace: ${ledgerEntry.taskId}`);

    const existing = await first(db, "SELECT * FROM post_ledger WHERE workspace_id = ? AND task_id = ?", [workspaceId, ledgerEntry.taskId]);
    if (existing) return ledgerFromRow(existing);

    const now = new Date().toISOString();
    const row = {
      ledger_id: ledgerEntry.ledgerId || createStableId("ledger", [workspaceId, ledgerEntry.taskId]),
      workspace_id: workspaceId,
      task_id: ledgerEntry.taskId,
      account_id: ledgerEntry.accountId || task.account_id || "",
      employee_id: ledgerEntry.employeeId || actor.userId || "",
      tool_id: ledgerEntry.toolId || task.tool_id || "",
      copy_id: ledgerEntry.copyId || task.copy_id || "",
      normalized_text_hash: ledgerEntry.normalizedTextHash || "",
      posted_text: ledgerEntry.postedText || task.copy_text || "",
      posted_url: ledgerEntry.postedUrl || "",
      posted_at: ledgerEntry.postedAt || now,
      metrics_json: JSON.stringify(ledgerEntry.metrics || {}),
      created_at: ledgerEntry.createdAt || now,
      updated_at: now
    };
    await run(
      db,
      `INSERT INTO post_ledger (
        ledger_id, workspace_id, task_id, account_id, employee_id, tool_id, copy_id,
        normalized_text_hash, posted_text, posted_url, posted_at, metrics_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Object.values(row)
    );
    await writeAuditLog({
      workspaceId,
      actorUserId: actor.userId || row.employee_id,
      actorRole: actor.role || "staff",
      action: "ledger.append",
      entityType: "post_ledger",
      entityId: row.ledger_id,
      metadata: { taskId: row.task_id, accountId: row.account_id }
    });
    return ledgerFromRow(row);
  }

  async function upsertFeedback(workspaceId, feedbackEntry = {}, actor = {}) {
    if (feedbackEntry.taskId) {
      const task = await first(db, "SELECT task_id FROM post_tasks WHERE workspace_id = ? AND task_id = ?", [workspaceId, feedbackEntry.taskId]);
      if (!task) throw new Error(`Task not found in workspace: ${feedbackEntry.taskId}`);
    }
    const now = new Date().toISOString();
    const feedbackId = feedbackEntry.feedbackId || feedbackEntry.id || createStableId("feedback", [
      workspaceId,
      feedbackEntry.taskId || "",
      feedbackEntry.copyId || "",
      now
    ]);
    const row = {
      feedback_id: feedbackId,
      workspace_id: workspaceId,
      task_id: feedbackEntry.taskId || "",
      ledger_id: feedbackEntry.ledgerId || "",
      account_id: feedbackEntry.accountId || "",
      tool_id: feedbackEntry.toolId || "",
      copy_id: feedbackEntry.copyId || "",
      metrics_json: JSON.stringify(feedbackEntry.metrics || {}),
      notes: feedbackEntry.notes || "",
      created_at: feedbackEntry.createdAt || now,
      updated_at: now
    };
    await run(
      db,
      `INSERT INTO feedback (
        feedback_id, workspace_id, task_id, ledger_id, account_id, tool_id, copy_id,
        metrics_json, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(feedback_id) DO UPDATE SET
        metrics_json = excluded.metrics_json,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
      Object.values(row)
    );
    await writeAuditLog({
      workspaceId,
      actorUserId: actor.userId || "",
      actorRole: actor.role || "staff",
      action: "feedback.upsert",
      entityType: "feedback",
      entityId: feedbackId,
      metadata: { taskId: row.task_id, accountId: row.account_id }
    });
    return feedbackFromRow(row);
  }

  async function writeAuditLog(event = {}) {
    const now = new Date().toISOString();
    const row = {
      audit_id: event.auditId || createStableId("audit", [
        event.workspaceId || "",
        event.action || event.type || "event",
        event.entityId || event.targetId || "",
        now
      ]),
      workspace_id: event.workspaceId || "",
      actor_user_id: event.actorUserId || "",
      actor_role: event.actorRole || "system",
      action: event.action || event.type || "event",
      entity_type: event.entityType || event.targetType || "",
      entity_id: event.entityId || event.targetId || "",
      metadata_json: JSON.stringify(event.metadata || { summary: event.summary || "" }),
      created_at: event.createdAt || now
    };
    await run(
      db,
      `INSERT INTO audit_logs (
        audit_id, workspace_id, actor_user_id, actor_role, action,
        entity_type, entity_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Object.values(row)
    );
    return auditFromRow(row);
  }

  return createStorageAdapter({
    getWorkspace,
    listWorkspaceTasks,
    listStaffTasks,
    updateTaskStatus,
    appendLedgerEntry,
    upsertFeedback,
    writeAuditLog,
    loadAuthCollections,
    loadManagerSummary
  });
}

export default createD1StorageAdapter;

async function first(db, sql, params = []) {
  const statement = bind(db.prepare(sql), params);
  if (typeof statement.first === "function") return statement.first();
  const result = await statement.all();
  return (result.results || result || [])[0] || null;
}

async function all(db, sql, params = []) {
  const statement = bind(db.prepare(sql), params);
  const result = await statement.all();
  return result.results || result || [];
}

async function run(db, sql, params = []) {
  const statement = bind(db.prepare(sql), params);
  return statement.run();
}

function bind(statement, params) {
  return params.length && typeof statement.bind === "function" ? statement.bind(...params) : statement;
}

function workspaceFromRow(row) {
  return {
    workspaceId: row.workspace_id,
    name: row.name,
    plan: row.plan,
    accountLimit: row.account_limit,
    publishMode: row.publish_mode,
    autoPublishEnabled: Boolean(row.auto_publish_enabled),
    requiresFinalApproval: Boolean(row.requires_final_approval),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    managerUserIds: [],
    staffUserIds: [],
    enabledLaneIds: []
  };
}

function taskFromRow(row) {
  return {
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    accountId: row.account_id || "",
    assignedTo: row.assigned_to || "",
    managerUserId: row.manager_user_id || "",
    toolId: row.tool_id || "",
    toolName: row.tool_name || row.tool_id || "",
    toolUrl: row.tool_url || "",
    topicId: row.topic_id || "",
    laneId: row.lane_id || "",
    copyId: row.copy_id || "",
    variantType: row.variant_type || "shortPost",
    copyText: row.copy_text || "",
    status: row.status,
    approvalStatus: row.approval_status,
    weightedCharCount: row.weighted_char_count,
    duplicateCheckResult: parseJson(row.duplicate_check_json, {}),
    riskFlags: parseJson(row.risk_flags_json, []),
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function ledgerFromRow(row) {
  return {
    ledgerId: row.ledger_id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    accountId: row.account_id,
    employeeId: row.employee_id || "",
    toolId: row.tool_id || "",
    copyId: row.copy_id || "",
    normalizedTextHash: row.normalized_text_hash || "",
    postedText: row.posted_text || "",
    postedUrl: row.posted_url || "",
    postedAt: row.posted_at || "",
    metrics: parseJson(row.metrics_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function feedbackFromRow(row) {
  return {
    feedbackId: row.feedback_id,
    workspaceId: row.workspace_id,
    taskId: row.task_id || "",
    ledgerId: row.ledger_id || "",
    accountId: row.account_id || "",
    toolId: row.tool_id || "",
    copyId: row.copy_id || "",
    metrics: parseJson(row.metrics_json, {}),
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function auditFromRow(row) {
  return {
    auditId: row.audit_id,
    workspaceId: row.workspace_id || "",
    actorUserId: row.actor_user_id || "",
    actorRole: row.actor_role || "system",
    action: row.action,
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at
  };
}

async function loadD1Collections() {
  const [workspaceRows, memberRows, userRows, assignmentRows, accountRows, taskRows, ledgerRows, publishJobRows, feedbackRows] = await Promise.all([
    all(db, "SELECT * FROM workspaces WHERE status != 'archived' ORDER BY workspace_id"),
    all(db, "SELECT * FROM workspace_members WHERE status != 'disabled' ORDER BY workspace_id, user_id"),
    all(db, "SELECT * FROM users WHERE status != 'disabled' ORDER BY user_id"),
    all(db, "SELECT * FROM assignments WHERE active != 0 ORDER BY assignment_id"),
    all(db, "SELECT * FROM x_accounts ORDER BY account_id"),
    all(
      db,
      `SELECT post_tasks.*, tools.canonical_name AS tool_name, tools.url AS tool_url,
        topics.lane_id AS lane_id, copy_library.variant_type AS variant_type
       FROM post_tasks
       LEFT JOIN tools ON tools.tool_id = post_tasks.tool_id
       LEFT JOIN topics ON topics.topic_id = post_tasks.topic_id
       LEFT JOIN copy_library ON copy_library.copy_id = post_tasks.copy_id
       ORDER BY post_tasks.created_at DESC, post_tasks.task_id ASC`
    ),
    all(db, "SELECT * FROM post_ledger ORDER BY created_at DESC"),
    all(db, "SELECT * FROM publish_jobs ORDER BY created_at DESC"),
    all(db, "SELECT * FROM feedback ORDER BY created_at DESC")
  ]);

  const workspaces = workspaceRows.map(workspaceFromRow);
  const workspaceMap = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]));
  const workspaceLaneRows = await all(db, "SELECT workspace_id, lane_id FROM workspace_lanes WHERE enabled != 0 ORDER BY priority, lane_id");
  for (const row of workspaceLaneRows) {
    const workspace = workspaceMap.get(row.workspace_id);
    if (workspace) workspace.enabledLaneIds.push(row.lane_id);
  }
  for (const member of memberRows) {
    const workspace = workspaceMap.get(member.workspace_id);
    if (!workspace) continue;
    if (member.role === "manager" || member.role === "admin") workspace.managerUserIds.push(member.user_id);
    if (member.role === "staff") workspace.staffUserIds.push(member.user_id);
  }

  const primaryWorkspaceByUser = new Map();
  for (const member of memberRows) {
    if (!primaryWorkspaceByUser.has(member.user_id)) primaryWorkspaceByUser.set(member.user_id, member.workspace_id);
  }

  return {
    workspaces,
    users: userRows.map((row) => userFromRow(row, primaryWorkspaceByUser.get(row.user_id))),
    assignments: assignmentRows.map(assignmentFromRow),
    xAccounts: accountRows.map(accountFromRow),
    tasks: taskRows.map(taskFromRow),
    ledger: ledgerRows.map(ledgerFromRow),
    publishJobs: publishJobRows.map(publishJobFromRow),
    feedback: feedbackRows.map(feedbackFromRow)
  };
}

async function listWorkspaceLaneIds(db, workspaceId) {
  const rows = await all(db, "SELECT lane_id FROM workspace_lanes WHERE workspace_id = ? AND enabled != 0 ORDER BY priority, lane_id", [workspaceId]);
  return rows.map((row) => row.lane_id);
}

function userFromRow(row, workspaceId = "") {
  return {
    userId: row.user_id,
    email: row.email || "",
    name: row.name || row.user_id,
    role: row.role || "staff",
    status: row.status || "active",
    active: row.status !== "disabled",
    workspaceId,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assignmentFromRow(row) {
  return {
    assignmentId: row.assignment_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    accountId: row.account_id,
    active: Boolean(row.active),
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function accountFromRow(row) {
  return {
    accountId: row.account_id,
    workspaceId: row.workspace_id,
    handle: row.handle || "",
    persona: row.persona || row.account_id,
    niche: row.niche || "",
    status: row.status || "active",
    dailyPostLimit: Number(row.daily_post_limit || 0),
    externalLinkLimit: Number(row.external_link_limit || 0),
    managerUserId: row.manager_user_id || "",
    ownerUserId: row.owner_user_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publishJobFromRow(row) {
  return {
    jobId: row.job_id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    accountId: row.account_id,
    status: row.status,
    dryRun: Boolean(row.dry_run),
    scheduledAt: row.scheduled_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function publicPatch(patch) {
  const next = { ...patch };
  delete next.token;
  delete next.secret;
  return next;
}
