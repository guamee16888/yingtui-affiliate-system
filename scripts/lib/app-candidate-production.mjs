import { checkTaskDuplicateRisk } from "./duplicate-checker.mjs";
import { createCopyId, createStableId, createTaskId, createTopicId, createToolId, todayString } from "./ids.mjs";
import { buildShortCopy, LANE_COPY_PROFILES } from "./raw-candidate-converter.mjs";
import { classifyRiskFlags, CONTENT_LANE_IDS } from "./source-classifier.mjs";
import { createSimilarityFingerprint, extractExternalLinks, hashText, normalizeText } from "./text-normalizer.mjs";
import { analyzeTweetLength } from "./tweet-length.mjs";
import { normalizeDomain } from "./url-utils.mjs";

const LANE_ALIASES = {
  indie_hackers: "indie_builders"
};

const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.invalid",
  "example.org",
  "localhost"
]);

export function buildLocalCandidateRawRows({
  rawCandidates = [],
  sourceCandidates = [],
  workspaceId = "",
  now = new Date().toISOString(),
  limit = 80
} = {}) {
  const stats = {
    scanned: 0,
    rows: 0,
    skippedPlaceholder: 0,
    skippedRisk: 0,
    skippedNoLane: 0,
    skippedInactive: 0
  };
  const rows = [];
  const seenIds = new Set();

  for (const candidate of [...sourceCandidatesToRawInputs(sourceCandidates), ...rawCandidatesToRawInputs(rawCandidates)]) {
    stats.scanned += 1;
    if (rows.length >= limit) break;
    if (!["active", "new", "accepted", ""].includes(String(candidate.status || "").toLowerCase())) {
      stats.skippedInactive += 1;
      continue;
    }
    if (isPlaceholderUrl(candidate.url)) {
      stats.skippedPlaceholder += 1;
      continue;
    }

    const laneIds = normalizeLaneIds(candidate.laneIds?.length ? candidate.laneIds : [candidate.laneId || candidate.circle]);
    if (!laneIds.length) {
      stats.skippedNoLane += 1;
      continue;
    }

    for (const laneId of laneIds) {
      const riskFlags = classifyRiskFlags({
        title: candidate.title,
        name: candidate.title,
        summary: candidate.summary,
        rawText: candidate.rawText,
        notes: candidate.notes,
        url: candidate.url
      }, [laneId]);
      if (riskFlags.some((flag) => flag.severity === "block")) {
        stats.skippedRisk += 1;
        continue;
      }
      const rawCandidateId = createStableId("raw", [candidate.sourceId || "", candidate.id || "", candidate.title, candidate.url, laneId]);
      if (seenIds.has(rawCandidateId)) continue;
      seenIds.add(rawCandidateId);
      rows.push({
        raw_candidate_id: rawCandidateId,
        workspace_id: workspaceId || null,
        lane_id: laneId,
        connector_id: null,
        feed_id: null,
        title: String(candidate.title || "").trim(),
        url: String(candidate.url || "").trim(),
        summary: String(candidate.summary || "").trim(),
        status: "new",
        risk_flags_json: JSON.stringify(riskFlags),
        source_published_at: normalizePublishedAt(candidate.sourcePublishedAt || candidate.published),
        created_at: candidate.createdAt || now,
        updated_at: now
      });
      stats.rows += 1;
    }
  }

  return { rows, stats };
}

export function buildD1CandidateProductionPlan({
  workspaceId = "",
  date = todayString(),
  now = new Date().toISOString(),
  limit = 20,
  importRows = [],
  d1 = {}
} = {}) {
  if (!workspaceId) throw new Error("--workspace-id is required.");
  const workspace = (d1.workspaces || []).find((item) => item.workspace_id === workspaceId);
  if (!workspace || workspace.status === "archived") throw new Error(`Unknown or inactive workspace: ${workspaceId}`);

  const enabledLaneIds = new Set((d1.workspaceLanes || [])
    .filter((row) => row.workspace_id === workspaceId && Number(row.enabled ?? 1) !== 0)
    .map((row) => normalizeLaneId(row.lane_id))
    .filter(Boolean));
  if (!enabledLaneIds.size) throw new Error(`Workspace has no enabled lanes: ${workspaceId}`);

  const stats = {
    workspaceId,
    scannedRawCandidates: 0,
    importedRawCandidates: 0,
    skippedExistingRaw: 0,
    skippedNoWorkspaceLane: 0,
    skippedRisk: 0,
    skippedPlaceholder: 0,
    skippedExistingTask: 0,
    toolsAdded: 0,
    topicsAdded: 0,
    copiesAdded: 0,
    tasksAdded: 0,
    blockedTasks: 0,
    warningTasks: 0,
    statements: 0
  };
  const statements = [];
  const existingRawIds = new Set((d1.rawCandidates || []).map((row) => row.raw_candidate_id));
  const existingToolIds = new Set((d1.tools || []).map((row) => row.tool_id));
  const existingTopicIds = new Set((d1.topics || []).map((row) => row.topic_id));
  const existingCopyIds = new Set((d1.copyLibrary || []).map((row) => row.copy_id));
  const existingTaskIds = new Set((d1.postTasks || []).map((row) => row.task_id));

  const newRawRows = [];
  for (const row of importRows) {
    if (existingRawIds.has(row.raw_candidate_id)) {
      stats.skippedExistingRaw += 1;
      continue;
    }
    const laneId = normalizeLaneId(row.lane_id);
    if (!enabledLaneIds.has(laneId)) {
      stats.skippedNoWorkspaceLane += 1;
      continue;
    }
    statements.push(insertOrIgnore("raw_candidates", { ...row, lane_id: laneId, workspace_id: row.workspace_id || workspaceId }));
    existingRawIds.add(row.raw_candidate_id);
    newRawRows.push({ ...row, lane_id: laneId, workspace_id: row.workspace_id || workspaceId });
    stats.importedRawCandidates += 1;
  }

  const candidateRows = [...(d1.rawCandidates || []), ...newRawRows]
    .filter((row) => !row.workspace_id || row.workspace_id === workspaceId)
    .sort((a, b) => String(b.source_published_at || b.created_at).localeCompare(String(a.source_published_at || a.created_at)));

  const context = buildDuplicateContext({ d1, workspaceId, date });
  const addedTasks = [];
  const accountUseCount = accountCountsForDate(context.tasks, date);

  for (const raw of candidateRows) {
    stats.scannedRawCandidates += 1;
    if (stats.tasksAdded >= limit) break;
    if (!["new", "accepted"].includes(String(raw.status || "new"))) continue;
    if (isPlaceholderUrl(raw.url)) {
      stats.skippedPlaceholder += 1;
      continue;
    }
    const laneId = normalizeLaneId(raw.lane_id);
    if (!enabledLaneIds.has(laneId)) {
      stats.skippedNoWorkspaceLane += 1;
      continue;
    }
    if (parseJson(raw.risk_flags_json, []).some((flag) => flag.severity === "block")) {
      stats.skippedRisk += 1;
      continue;
    }

    const profile = LANE_COPY_PROFILES[laneId];
    if (!profile) {
      stats.skippedNoWorkspaceLane += 1;
      continue;
    }

    const tool = buildToolRow(raw, now);
    const topic = buildTopicRow({ raw, tool, workspaceId, laneId, profile, now });
    const copy = buildCopyRow({ raw, tool, topic, laneId, now });
    const account = pickAccountForLane({ laneId, accounts: d1.xAccounts || [], accountUseCount });
    const assignment = (d1.assignments || []).find((item) => item.workspace_id === workspaceId && item.account_id === account?.account_id && Number(item.active ?? 1) !== 0);
    const manager = managerUserId({ workspaceId, workspaceMembers: d1.workspaceMembers || [], account });
    const task = buildTaskRow({
      workspaceId,
      raw,
      tool,
      topic,
      copy,
      account,
      assignment,
      managerUserId: manager,
      date,
      now
    });

    if (existingTaskIds.has(task.task_id)) {
      stats.skippedExistingTask += 1;
      statements.push(updateRawConverted(raw.raw_candidate_id, workspaceId, now));
      continue;
    }

    const duplicateCheckResult = checkTaskDuplicateRisk({
      task: taskForDuplicateCheck({ task, raw, tool, copy, date }),
      context
    });
    const riskFlags = duplicateCheckResult.flags.map((flag) => flag.type);
    if (duplicateCheckResult.riskLevel === "block") {
      task.status = "draft";
      task.approval_status = "rejected";
      stats.blockedTasks += 1;
    } else if (duplicateCheckResult.riskLevel === "medium") {
      stats.warningTasks += 1;
    }
    task.duplicate_check_json = JSON.stringify(duplicateCheckResult);
    task.risk_flags_json = JSON.stringify(riskFlags);

    if (!existingToolIds.has(tool.tool_id)) {
      statements.push(insertOrIgnore("tools", tool));
      existingToolIds.add(tool.tool_id);
      stats.toolsAdded += 1;
    }
    if (!existingTopicIds.has(topic.topic_id)) {
      statements.push(insertOrIgnore("topics", topic));
      existingTopicIds.add(topic.topic_id);
      stats.topicsAdded += 1;
    }
    if (!existingCopyIds.has(copy.copy_id)) {
      statements.push(insertOrIgnore("copy_library", copy));
      existingCopyIds.add(copy.copy_id);
      stats.copiesAdded += 1;
    }
    statements.push(insertOrIgnore("post_tasks", task));
    statements.push(updateRawConverted(raw.raw_candidate_id, workspaceId, now));
    existingTaskIds.add(task.task_id);
    stats.tasksAdded += 1;
    accountUseCount.set(task.account_id || "", (accountUseCount.get(task.account_id || "") || 0) + 1);
    addedTasks.push(taskForDuplicateCheck({ task, raw, tool, copy, date }));
    context.tasks.push(addedTasks.at(-1));
    context.copyLibrary.push(copyForDuplicateCheck(copy));
  }

  if (stats.tasksAdded || stats.importedRawCandidates) {
    statements.push(insertOrIgnore("audit_logs", {
      audit_id: createStableId("audit", [workspaceId, "candidate.production", now, stats.tasksAdded, stats.importedRawCandidates]),
      workspace_id: workspaceId,
      actor_user_id: "",
      actor_role: "system",
      action: "candidate.production",
      entity_type: "workspace",
      entity_id: workspaceId,
      metadata_json: JSON.stringify({
        importedRawCandidates: stats.importedRawCandidates,
        tasksAdded: stats.tasksAdded,
        date
      }),
      created_at: now
    }));
  }

  stats.statements = statements.length;
  return { sql: `${statements.join("\n")}\n`, statements, stats };
}

function sourceCandidatesToRawInputs(sourceCandidates) {
  return (sourceCandidates || []).map((item) => ({
    id: item.id || item.sourceCandidateId || "",
    sourceId: item.source || "",
    laneId: item.circle || "",
    title: item.name || item.title || "",
    url: item.url || "",
    summary: item.tagline || item.description || "",
    rawText: item.description || item.tagline || item.notes || "",
    notes: item.notes || "",
    published: item.published || "",
    status: item.status || "active",
    createdAt: item.createdAt || "",
    sourcePublishedAt: item.published || ""
  }));
}

function rawCandidatesToRawInputs(rawCandidates) {
  return (rawCandidates || []).map((item) => ({
    id: item.candidateId || item.raw_candidate_id || "",
    sourceId: item.sourceId || item.connectorId || "",
    laneIds: item.laneIds || [item.lane_id].filter(Boolean),
    title: item.title || "",
    url: item.url || "",
    summary: item.summary || "",
    rawText: item.rawText || "",
    notes: item.notes || "",
    status: item.status || "new",
    createdAt: item.createdAt || item.created_at || "",
    sourcePublishedAt: item.sourcePublishedAt || item.source_published_at || ""
  }));
}

function buildToolRow(raw, now) {
  const toolId = createToolId(raw.title, raw.url);
  return {
    tool_id: toolId,
    canonical_name: raw.title,
    url: raw.url || "",
    domain: normalizeDomain(raw.url),
    tagline: raw.summary || "",
    created_at: now,
    updated_at: now
  };
}

function buildTopicRow({ raw, tool, workspaceId, laneId, profile, now }) {
  const painPoint = raw.summary || profile.painPoint;
  return {
    topic_id: createTopicId(tool.tool_id, "shortPost", profile.audience, painPoint, profile.useCase),
    workspace_id: workspaceId,
    tool_id: tool.tool_id,
    lane_id: laneId,
    angle: `${profile.audience}: ${shortPhrase(painPoint, 110)}`,
    status: "ready",
    score: 80,
    created_at: now,
    updated_at: now
  };
}

function buildCopyRow({ raw, tool, topic, laneId, now }) {
  const copyText = buildShortCopy({
    title: raw.title,
    summary: raw.summary
  }, laneId);
  const length = analyzeTweetLength(copyText);
  return {
    copy_id: createCopyId(topic.topic_id, "shortPost", copyText),
    workspace_id: topic.workspace_id,
    topic_id: topic.topic_id,
    tool_id: tool.tool_id,
    variant_type: "shortPost",
    copy_text: copyText,
    normalized_text_hash: hashText(copyText),
    weighted_char_count: length.weightedCharCount,
    status: length.fitsXPost ? "ready" : "needs_revision",
    created_at: now,
    updated_at: now
  };
}

function buildTaskRow({ workspaceId, raw, tool, topic, copy, account, assignment, managerUserId, date, now }) {
  const accountId = account?.account_id || "";
  return {
    task_id: createTaskId(date, accountId || "no_account", copy.copy_id),
    workspace_id: workspaceId,
    account_id: accountId || null,
    assigned_to: assignment?.user_id || null,
    manager_user_id: managerUserId || null,
    tool_id: tool.tool_id,
    topic_id: topic.topic_id,
    copy_id: copy.copy_id,
    copy_text: copy.copy_text,
    status: "pending_review",
    approval_status: "pending",
    weighted_char_count: copy.weighted_char_count,
    duplicate_check_json: "{}",
    risk_flags_json: "[]",
    notes: `Converted from raw candidate ${raw.raw_candidate_id}; source ${normalizeDomain(raw.url) || "unknown"}.`,
    created_at: now,
    updated_at: now
  };
}

function buildDuplicateContext({ d1, workspaceId, date }) {
  return {
    tasks: (d1.postTasks || [])
      .filter((task) => task.workspace_id === workspaceId)
      .map((task) => ({
        taskId: task.task_id,
        date: String(task.created_at || date).slice(0, 10),
        workspaceId: task.workspace_id,
        accountId: task.account_id || "",
        assignedTo: task.assigned_to || "",
        toolId: task.tool_id || "",
        copyId: task.copy_id || "",
        copyText: task.copy_text || "",
        status: task.status || "",
        approvalStatus: task.approval_status || ""
      })),
    ledger: (d1.postLedger || [])
      .filter((item) => item.workspace_id === workspaceId)
      .map((item) => ({
        ledgerId: item.ledger_id,
        accountId: item.account_id || "",
        employeeId: item.employee_id || "",
        toolId: item.tool_id || "",
        copyId: item.copy_id || "",
        normalizedTextHash: item.normalized_text_hash || "",
        postedText: item.posted_text || "",
        postedUrl: item.posted_url || "",
        postedAt: item.posted_at || "",
        externalLinks: extractExternalLinks(item.posted_text || "")
      })),
    xAccounts: (d1.xAccounts || [])
      .filter((account) => account.workspace_id === workspaceId)
      .map((account) => ({
        accountId: account.account_id,
        status: account.status,
        dailyPostLimit: Number(account.daily_post_limit || 10),
        externalLinkLimit: Number(account.external_link_limit || 1),
        managerUserId: account.manager_user_id || "",
        niche: account.niche || "",
        persona: account.persona || ""
      })),
    users: (d1.users || []).map((user) => ({ userId: user.user_id, active: user.status !== "disabled" })),
    copyLibrary: (d1.copyLibrary || [])
      .filter((copy) => copy.workspace_id === workspaceId)
      .map(copyForDuplicateCheck),
    accountHealth: [],
    contentRules: { rules: {} }
  };
}

function taskForDuplicateCheck({ task, raw, tool, date }) {
  return {
    taskId: task.task_id,
    date,
    workspaceId: task.workspace_id,
    accountId: task.account_id || "",
    assignedTo: task.assigned_to || "",
    toolId: task.tool_id,
    toolUrl: tool.url || raw.url || "",
    copyId: task.copy_id,
    copyText: task.copy_text,
    status: task.status,
    approvalStatus: task.approval_status,
    externalLinks: extractExternalLinks(task.copy_text),
    weightedCharCount: task.weighted_char_count,
    affiliateLinkUsed: ""
  };
}

function copyForDuplicateCheck(copy) {
  return {
    copyId: copy.copy_id,
    copyText: copy.copy_text,
    normalizedTextHash: copy.normalized_text_hash,
    normalizedText: normalizeText(copy.copy_text),
    similarityFingerprint: createSimilarityFingerprint(copy.copy_text)
  };
}

function pickAccountForLane({ laneId, accounts, accountUseCount }) {
  const activeAccounts = accounts.filter((account) => account.status !== "paused" && account.status !== "archived");
  if (!activeAccounts.length) return null;
  const hints = LANE_COPY_PROFILES[laneId]?.accountHints ?? [];
  const hinted = activeAccounts.filter((account) => {
    const text = [account.account_id, account.niche, account.persona].join(" ").toLowerCase();
    return hints.some((hint) => text.includes(hint));
  });
  const candidates = hinted.length ? hinted : activeAccounts;
  return [...candidates].sort((a, b) => {
    const aCount = accountUseCount.get(a.account_id) || 0;
    const bCount = accountUseCount.get(b.account_id) || 0;
    return aCount - bCount || String(a.account_id).localeCompare(String(b.account_id));
  })[0] || null;
}

function accountCountsForDate(tasks, date) {
  const counts = new Map();
  for (const task of tasks) {
    if (task.date === date && task.accountId) counts.set(task.accountId, (counts.get(task.accountId) || 0) + 1);
  }
  return counts;
}

function managerUserId({ workspaceId, workspaceMembers, account }) {
  return account?.manager_user_id
    || workspaceMembers.find((member) => member.workspace_id === workspaceId && ["manager", "admin"].includes(member.role) && member.status !== "disabled")?.user_id
    || "";
}

function normalizeLaneIds(values) {
  return [...new Set((values || []).map(normalizeLaneId).filter((laneId) => CONTENT_LANE_IDS.includes(laneId)))];
}

function normalizeLaneId(value) {
  return LANE_ALIASES[String(value || "").trim()] || String(value || "").trim();
}

function isPlaceholderUrl(url) {
  const domain = normalizeDomain(url);
  return !domain || PLACEHOLDER_DOMAINS.has(domain);
}

function normalizePublishedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function shortPhrase(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).replace(/\s+\S*$/, "")}...`;
}

function updateRawConverted(rawCandidateId, workspaceId, now) {
  return `UPDATE raw_candidates SET status = 'converted_to_topic', workspace_id = ${sqlValue(workspaceId)}, updated_at = ${sqlValue(now)} WHERE raw_candidate_id = ${sqlValue(rawCandidateId)};`;
}

function insertOrIgnore(table, row) {
  const columns = Object.keys(row);
  const values = columns.map((column) => sqlValue(row[column]));
  return `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
}

function sqlValue(value) {
  if (typeof value === "number") return String(value);
  if (value === null || value === undefined || value === "") return value === "" ? "''" : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
