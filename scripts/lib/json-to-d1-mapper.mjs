import { readJson } from "./file-store.mjs";
import { createStableId } from "./ids.mjs";
import { analyzeTweetLength } from "./tweet-length.mjs";
import { normalizeDomain, normalizeUrl } from "./url-utils.mjs";

export const JSON_TO_D1_SOURCES = {
  workspaces: "data/workspaces.json",
  users: "data/users.json",
  xAccounts: "data/x-accounts.json",
  assignments: "data/assignments.json",
  contentLanes: "data/content-lanes.json",
  workspaceLanes: "data/workspace-lanes.json",
  sourceConnectors: "data/source-connectors.json",
  sourceFeeds: "data/source-feeds.json",
  rawCandidates: "data/raw-candidates.json",
  tools: "data/tools.json",
  topics: "data/topics.json",
  copyLibrary: "data/copy-library.json",
  postTasks: "data/post-tasks.json",
  postLedger: "data/post-ledger.json",
  feedback: "data/feedback.json",
  publishSettings: "data/publish-settings.json",
  xConnections: "data/x-connections.json",
  publishJobs: "data/publish-jobs.json",
  publishAttempts: "data/publish-attempts.json"
};

export const TABLE_PRIMARY_KEYS = {
  workspaces: "workspace_id",
  users: "user_id",
  workspace_members: "workspace_member_id",
  x_accounts: "account_id",
  assignments: "assignment_id",
  content_lanes: "lane_id",
  workspace_lanes: "workspace_lane_id",
  source_connectors: "connector_id",
  source_feeds: "feed_id",
  raw_candidates: "raw_candidate_id",
  tools: "tool_id",
  topics: "topic_id",
  copy_library: "copy_id",
  post_tasks: "task_id",
  post_ledger: "ledger_id",
  feedback: "feedback_id",
  publish_settings: "publish_settings_id",
  x_connections: "connection_id",
  publish_jobs: "job_id",
  publish_attempts: "attempt_id",
  audit_logs: "audit_id",
  api_events: "api_event_id"
};

const DEFAULT_WORKSPACE_ID = "workspace_default";

export async function loadJsonToD1Sources() {
  const entries = await Promise.all(
    Object.entries(JSON_TO_D1_SOURCES).map(async ([key, file]) => [key, await readJson(file, fallbackFor(key))])
  );
  return Object.fromEntries(entries);
}

export function mapJsonToD1Rows(sourceData, options = {}) {
  const sanitize = options.sanitize !== false;
  const now = options.now || new Date().toISOString();
  const rows = Object.fromEntries(Object.keys(TABLE_PRIMARY_KEYS).map((table) => [table, []]));
  const summary = {
    counts: {
      workspaces: 0,
      users: 0,
      accounts: 0,
      tasks: 0,
      ledger: 0,
      feedback: 0
    },
    missingWorkspaceIdCount: 0,
    unmappedCount: 0,
    duplicatePrimaryKeyCount: 0,
    unmapped: []
  };

  const data = normalizeSources(sourceData);

  for (const workspace of data.workspaces) {
    if (!workspace.workspaceId) {
      skip(summary, "workspaces", workspace, "missing workspaceId");
      continue;
    }
    rows.workspaces.push({
      workspace_id: workspace.workspaceId,
      name: str(workspace.name || workspace.workspaceId),
      plan: str(workspace.plan || "internal"),
      account_limit: num(workspace.accountLimit, 30),
      publish_mode: str(workspace.publishMode || "manual"),
      auto_publish_enabled: boolInt(workspace.autoPublishEnabled),
      requires_final_approval: workspace.requiresFinalApproval === false ? 0 : 1,
      status: str(workspace.status || activeStatus(workspace.active)),
      created_at: time(workspace.createdAt, now),
      updated_at: time(workspace.updatedAt, now)
    });
  }

  for (const user of data.users) {
    if (!user.userId) {
      skip(summary, "users", user, "missing userId");
      continue;
    }
    rows.users.push({
      user_id: user.userId,
      email: sanitizeEmail(user.email),
      name: str(user.name || user.userId),
      role: str(user.role || "staff"),
      status: str(user.status || activeStatus(user.active)),
      created_at: time(user.createdAt, now),
      updated_at: time(user.updatedAt, now)
    });
    if (user.workspaceId) {
      addWorkspaceMember(rows, {
        workspaceId: user.workspaceId,
        userId: user.userId,
        role: user.role || "staff",
        now
      });
    }
  }

  for (const workspace of data.workspaces) {
    for (const userId of workspace.managerUserIds ?? []) {
      addWorkspaceMember(rows, { workspaceId: workspace.workspaceId, userId, role: "manager", now });
    }
    for (const userId of workspace.staffUserIds ?? []) {
      addWorkspaceMember(rows, { workspaceId: workspace.workspaceId, userId, role: "staff", now });
    }
  }

  for (const account of data.xAccounts) {
    if (!account.accountId) {
      skip(summary, "x_accounts", account, "missing accountId");
      continue;
    }
    countMissingWorkspace(summary, account);
    rows.x_accounts.push({
      account_id: account.accountId,
      workspace_id: workspaceId(account),
      handle: str(account.handle || ""),
      persona: str(account.persona || account.name || ""),
      niche: str(account.niche || ""),
      status: str(account.status || activeStatus(account.active)),
      daily_post_limit: num(account.dailyPostLimit, 10),
      external_link_limit: num(account.externalLinkLimit, 1),
      manager_user_id: str(account.managerUserId || ""),
      owner_user_id: str(account.ownerUserId || ""),
      created_at: time(account.createdAt, now),
      updated_at: time(account.updatedAt, now)
    });
  }

  for (const assignment of data.assignments) {
    if (!assignment.assignmentId || !assignment.userId || !assignment.accountId) {
      skip(summary, "assignments", assignment, "missing assignmentId/userId/accountId");
      continue;
    }
    countMissingWorkspace(summary, assignment);
    rows.assignments.push({
      assignment_id: assignment.assignmentId,
      workspace_id: workspaceId(assignment),
      user_id: assignment.userId,
      account_id: assignment.accountId,
      active: assignment.active === false ? 0 : 1,
      start_date: str(assignment.startDate || ""),
      end_date: str(assignment.endDate || ""),
      created_at: time(assignment.createdAt, now),
      updated_at: time(assignment.updatedAt, now)
    });
  }

  for (const lane of data.contentLanes) {
    if (!lane.laneId) {
      skip(summary, "content_lanes", lane, "missing laneId");
      continue;
    }
    rows.content_lanes.push({
      lane_id: lane.laneId,
      name: str(lane.name || lane.laneId),
      description: str(lane.description || ""),
      risk_policy: str(lane.riskPolicy || "conservative"),
      active: lane.active === false ? 0 : 1,
      created_at: time(lane.createdAt, now),
      updated_at: time(lane.updatedAt, now)
    });
  }

  for (const item of data.workspaceLanes) {
    if (!item.workspaceId || !item.laneId) {
      skip(summary, "workspace_lanes", item, "missing workspaceId/laneId");
      countMissingWorkspace(summary, item);
      continue;
    }
    rows.workspace_lanes.push({
      workspace_lane_id: createStableId("workspace_lane", [item.workspaceId, item.laneId]),
      workspace_id: item.workspaceId,
      lane_id: item.laneId,
      enabled: item.enabled === false ? 0 : 1,
      priority: num(item.priority, 1),
      monthly_quota: num(item.monthlyQuota, 0),
      created_at: time(item.createdAt, now),
      updated_at: time(item.updatedAt, now)
    });
  }

  for (const connector of data.sourceConnectors) {
    if (!connector.connectorId) {
      skip(summary, "source_connectors", connector, "missing connectorId");
      continue;
    }
    rows.source_connectors.push({
      connector_id: connector.connectorId,
      name: str(connector.name || connector.connectorId),
      type: str(connector.type || "manual"),
      status: str(connector.status || "paused"),
      secret_ref: sanitize ? "" : str(connector.secretRef || connector.secret_ref || ""),
      quality_tier: str(connector.qualityTier || ""),
      created_at: time(connector.createdAt, now),
      updated_at: time(connector.updatedAt, now)
    });
  }

  for (const feed of data.sourceFeeds) {
    if (!feed.feedId || !feed.connectorId) {
      skip(summary, "source_feeds", feed, "missing feedId/connectorId");
      continue;
    }
    rows.source_feeds.push({
      feed_id: feed.feedId,
      connector_id: feed.connectorId,
      lane_id: str(feed.laneId || ""),
      name: str(feed.name || feed.feedId),
      url: str(feed.url || ""),
      status: str(feed.status || "active"),
      quality_score: num(feed.qualityScore, 0),
      created_at: time(feed.createdAt, now),
      updated_at: time(feed.updatedAt, now)
    });
  }

  for (const candidate of data.rawCandidates) {
    if (!candidate.candidateId && !candidate.rawCandidateId) {
      skip(summary, "raw_candidates", candidate, "missing candidateId");
      continue;
    }
    if (!candidate.workspaceId) summary.missingWorkspaceIdCount += 1;
    rows.raw_candidates.push({
      raw_candidate_id: candidate.rawCandidateId || candidate.candidateId,
      workspace_id: str(candidate.workspaceId || ""),
      lane_id: str(candidate.laneId || candidate.laneIds?.[0] || ""),
      connector_id: str(candidate.connectorId || ""),
      feed_id: str(candidate.feedId || ""),
      title: str(candidate.title || ""),
      url: str(candidate.url || ""),
      summary: str(candidate.summary || ""),
      status: str(candidate.status || "new"),
      risk_flags_json: json(candidate.riskFlags || []),
      source_published_at: str(candidate.sourcePublishedAt || ""),
      created_at: time(candidate.createdAt, now),
      updated_at: time(candidate.updatedAt, now)
    });
  }

  for (const tool of data.tools) {
    if (!tool.toolId) {
      skip(summary, "tools", tool, "missing toolId");
      continue;
    }
    const url = normalizeUrl(tool.officialUrl || tool.url || tool.productHuntUrl || "");
    rows.tools.push({
      tool_id: tool.toolId,
      canonical_name: str(tool.name || tool.canonicalName || tool.toolId),
      url,
      domain: str(tool.domain || normalizeDomain(url)),
      tagline: str(tool.tagline || ""),
      created_at: time(tool.createdAt || tool.firstSeenAt, now),
      updated_at: time(tool.updatedAt || tool.lastSeenAt, now)
    });
  }

  for (const topic of data.topics) {
    if (!topic.topicId) {
      skip(summary, "topics", topic, "missing topicId");
      continue;
    }
    countMissingWorkspace(summary, topic);
    rows.topics.push({
      topic_id: topic.topicId,
      workspace_id: workspaceId(topic),
      tool_id: str(topic.toolId || ""),
      lane_id: str(topic.laneId || topic.circle || ""),
      angle: str(topic.angle || topic.angleType || topic.useCase || topic.topic || ""),
      status: str(topic.status || "draft"),
      score: num(topic.score || topic.priorityScore, 0),
      created_at: time(topic.createdAt, now),
      updated_at: time(topic.updatedAt, now)
    });
  }

  for (const copy of data.copyLibrary) {
    if (!copy.copyId) {
      skip(summary, "copy_library", copy, "missing copyId");
      continue;
    }
    countMissingWorkspace(summary, copy);
    rows.copy_library.push({
      copy_id: copy.copyId,
      workspace_id: workspaceId(copy),
      topic_id: str(copy.topicId || ""),
      tool_id: str(copy.toolId || ""),
      variant_type: str(copy.variantType || "shortPost"),
      copy_text: str(copy.copyText || ""),
      normalized_text_hash: str(copy.normalizedTextHash || createStableId("copyhash", [copy.copyText || ""])),
      weighted_char_count: num(copy.weightedCharCount, analyzeTweetLength(copy.copyText || "").weightedCharCount),
      status: str(copy.status || "draft"),
      created_at: time(copy.createdAt, now),
      updated_at: time(copy.updatedAt, now)
    });
  }

  for (const task of data.postTasks) {
    if (!task.taskId) {
      skip(summary, "post_tasks", task, "missing taskId");
      continue;
    }
    countMissingWorkspace(summary, task);
    rows.post_tasks.push({
      task_id: task.taskId,
      workspace_id: workspaceId(task),
      account_id: str(task.accountId || ""),
      assigned_to: str(task.assignedTo || ""),
      manager_user_id: str(task.managerUserId || ""),
      tool_id: str(task.toolId || ""),
      topic_id: str(task.topicId || ""),
      copy_id: str(task.copyId || ""),
      copy_text: str(task.copyText || ""),
      status: str(task.status || "pending_review"),
      approval_status: str(task.approvalStatus || "pending"),
      weighted_char_count: num(task.weightedCharCount, analyzeTweetLength(task.copyText || "").weightedCharCount),
      duplicate_check_json: json(task.duplicateCheckResult || {}),
      risk_flags_json: json(task.riskFlags || []),
      notes: str(task.notes || ""),
      created_at: time(task.createdAt, now),
      updated_at: time(task.updatedAt, now)
    });
  }

  for (const ledger of data.postLedger) {
    if (!ledger.ledgerId || !ledger.taskId) {
      skip(summary, "post_ledger", ledger, "missing ledgerId/taskId");
      continue;
    }
    countMissingWorkspace(summary, ledger);
    rows.post_ledger.push({
      ledger_id: ledger.ledgerId,
      workspace_id: workspaceId(ledger),
      task_id: ledger.taskId,
      account_id: str(ledger.accountId || ""),
      employee_id: str(ledger.employeeId || ledger.actorUserId || ""),
      tool_id: str(ledger.toolId || ""),
      copy_id: str(ledger.copyId || ""),
      normalized_text_hash: str(ledger.normalizedTextHash || ""),
      posted_text: str(ledger.postedText || ""),
      posted_url: sanitize ? "" : str(ledger.postedUrl || ""),
      posted_at: str(ledger.postedAt || ""),
      metrics_json: json(ledger.metrics || {}),
      created_at: time(ledger.createdAt, now),
      updated_at: time(ledger.updatedAt, now)
    });
  }

  for (const feedback of data.feedback) {
    if (!feedback.id && !feedback.feedbackId) {
      skip(summary, "feedback", feedback, "missing feedback id");
      continue;
    }
    countMissingWorkspace(summary, feedback);
    rows.feedback.push({
      feedback_id: feedback.feedbackId || feedback.id,
      workspace_id: workspaceId(feedback),
      task_id: str(feedback.taskId || ""),
      ledger_id: str(feedback.ledgerId || ""),
      account_id: str(feedback.accountId || ""),
      tool_id: str(feedback.toolId || ""),
      copy_id: str(feedback.copyId || ""),
      metrics_json: json(feedback.metrics || {}),
      notes: sanitizePostedUrls(str(feedback.notes || ""), sanitize),
      created_at: time(feedback.createdAt, now),
      updated_at: time(feedback.updatedAt, now)
    });
  }

  mapPublishSettings(rows, data.publishSettings, now);

  for (const connection of data.xConnections) {
    if (!connection.connectionId && !connection.accountId) {
      skip(summary, "x_connections", connection, "missing connectionId/accountId");
      continue;
    }
    countMissingWorkspace(summary, connection);
    rows.x_connections.push({
      connection_id: connection.connectionId || createStableId("xconn", [workspaceId(connection), connection.accountId]),
      workspace_id: workspaceId(connection),
      account_id: str(connection.accountId || ""),
      x_user_id: str(connection.xUserId || ""),
      handle: str(connection.handle || ""),
      token_ref: sanitize ? tokenRefOnly(connection.tokenRef) : str(connection.tokenRef || ""),
      status: str(connection.status || "not_connected"),
      scopes_json: json(connection.scopes || []),
      last_verified_at: str(connection.lastVerifiedAt || ""),
      created_at: time(connection.createdAt, now),
      updated_at: time(connection.updatedAt, now)
    });
  }

  for (const job of data.publishJobs) {
    if (!job.jobId || !job.taskId) {
      skip(summary, "publish_jobs", job, "missing jobId/taskId");
      continue;
    }
    countMissingWorkspace(summary, job);
    rows.publish_jobs.push({
      job_id: job.jobId,
      workspace_id: workspaceId(job),
      task_id: job.taskId,
      account_id: str(job.accountId || ""),
      status: str(job.status || "draft"),
      dry_run: job.dryRun === false ? 0 : 1,
      scheduled_at: str(job.scheduledAt || ""),
      created_at: time(job.createdAt, now),
      updated_at: time(job.updatedAt, now)
    });
  }

  for (const attempt of data.publishAttempts) {
    if (!attempt.attemptId || !attempt.jobId) {
      skip(summary, "publish_attempts", attempt, "missing attemptId/jobId");
      continue;
    }
    countMissingWorkspace(summary, attempt);
    rows.publish_attempts.push({
      attempt_id: attempt.attemptId,
      workspace_id: workspaceId(attempt),
      job_id: attempt.jobId,
      account_id: str(attempt.accountId || ""),
      status: str(attempt.status || ""),
      error_code: str(attempt.errorCode || ""),
      error_message: str(attempt.errorMessage || ""),
      created_at: time(attempt.createdAt, now)
    });
  }

  summary.counts.workspaces = rows.workspaces.length;
  summary.counts.users = rows.users.length;
  summary.counts.accounts = rows.x_accounts.length;
  summary.counts.tasks = rows.post_tasks.length;
  summary.counts.ledger = rows.post_ledger.length;
  summary.counts.feedback = rows.feedback.length;
  summary.duplicatePrimaryKeyCount = countDuplicatePrimaryKeys(rows);
  summary.unmappedCount = summary.unmapped.length;

  return { rows, summary };
}

export function rowsToSql(rows, options = {}) {
  const sanitize = options.sanitize !== false;
  const lines = [
    "-- This export may contain real operational data. Do not commit or deploy publicly.",
    sanitize ? "-- Sanitized export: token/secret fields and posted URLs are intentionally stripped." : "-- Unsanitized export requested.",
    "PRAGMA foreign_keys = ON;"
  ];
  for (const [table, tableRows] of Object.entries(rows)) {
    if (!tableRows.length || table === "audit_logs" || table === "api_events") continue;
    lines.push("");
    lines.push(`-- ${table}`);
    for (const row of tableRows) {
      const columns = Object.keys(row);
      const values = columns.map((column) => sqlValue(row[column])).join(", ");
      lines.push(`INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${values});`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function normalizeSources(sourceData) {
  return {
    workspaces: items(sourceData.workspaces),
    users: items(sourceData.users),
    xAccounts: items(sourceData.xAccounts),
    assignments: items(sourceData.assignments),
    contentLanes: items(sourceData.contentLanes),
    workspaceLanes: items(sourceData.workspaceLanes),
    sourceConnectors: items(sourceData.sourceConnectors),
    sourceFeeds: items(sourceData.sourceFeeds),
    rawCandidates: items(sourceData.rawCandidates),
    tools: items(sourceData.tools),
    topics: items(sourceData.topics),
    copyLibrary: items(sourceData.copyLibrary),
    postTasks: items(sourceData.postTasks),
    postLedger: items(sourceData.postLedger),
    feedback: items(sourceData.feedback, "entries"),
    publishSettings: sourceData.publishSettings || {},
    xConnections: items(sourceData.xConnections),
    publishJobs: items(sourceData.publishJobs),
    publishAttempts: items(sourceData.publishAttempts)
  };
}

function items(data, secondaryKey = "items") {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.[secondaryKey])) return data[secondaryKey];
  if (Array.isArray(data?.entries)) return data.entries;
  return [];
}

function fallbackFor(key) {
  if (key === "feedback") return { entries: [] };
  if (key === "publishSettings") return { settings: {} };
  return { items: [] };
}

function mapPublishSettings(rows, data, now) {
  const settings = data?.settings ?? {};
  rows.publish_settings.push({
    publish_settings_id: createStableId("publish_settings", [DEFAULT_WORKSPACE_ID]),
    workspace_id: DEFAULT_WORKSPACE_ID,
    global_auto_publish_enabled: boolInt(settings.globalAutoPublishEnabled),
    dry_run_by_default: settings.dryRunByDefault === false ? 0 : 1,
    require_approval_before_publish: settings.requireApprovalBeforePublish === false ? 0 : 1,
    settings_json: json(settings),
    created_at: time(data?.createdAt, now),
    updated_at: time(data?.updatedAt, now)
  });
}

function addWorkspaceMember(rows, { workspaceId, userId, role, now }) {
  if (!workspaceId || !userId) return;
  const existing = rows.workspace_members.find((item) => item.workspace_id === workspaceId && item.user_id === userId);
  if (existing) {
    if (existing.role !== "admin" && role === "admin") existing.role = "admin";
    return;
  }
  rows.workspace_members.push({
    workspace_member_id: createStableId("wm", [workspaceId, userId]),
    workspace_id: workspaceId,
    user_id: userId,
    role: str(role || "staff"),
    status: "active",
    created_at: now,
    updated_at: now
  });
}

function skip(summary, table, item, reason) {
  summary.unmapped.push({
    table,
    reason,
    id: item?.id || item?.taskId || item?.toolId || item?.accountId || item?.name || ""
  });
}

function countMissingWorkspace(summary, item) {
  if (!item.workspaceId) summary.missingWorkspaceIdCount += 1;
}

function countDuplicatePrimaryKeys(rows) {
  let count = 0;
  for (const [table, tableRows] of Object.entries(rows)) {
    const pk = TABLE_PRIMARY_KEYS[table];
    const seen = new Set();
    for (const row of tableRows) {
      const value = row[pk];
      if (!value) continue;
      if (seen.has(value)) count += 1;
      seen.add(value);
    }
  }
  return count;
}

function workspaceId(item) {
  return str(item.workspaceId || DEFAULT_WORKSPACE_ID);
}

function time(value, fallback) {
  return str(value || fallback);
}

function str(value) {
  return String(value ?? "");
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolInt(value) {
  return value === true ? 1 : 0;
}

function activeStatus(active) {
  return active === false ? "inactive" : "active";
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function sanitizeEmail(value) {
  return str(value || "");
}

function tokenRefOnly(value) {
  if (!value) return "";
  return "server_side_only";
}

function sanitizePostedUrls(value, sanitize) {
  if (!sanitize) return value;
  return value.replace(/https?:\/\/(?:x|twitter)\.com\/[^\s)]+/gi, "[posted-url-stripped]");
}

function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}
