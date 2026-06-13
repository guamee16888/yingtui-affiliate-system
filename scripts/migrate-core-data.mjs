import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_COLLECTIONS, CONTENT_RULES_PATH, DEFAULT_CONTENT_RULES, emptyCollection, ensureCoreDataFiles, loadCollection, loadContentRules, saveCollection, upsertById } from "./lib/core-data.mjs";
import { buildFeedbackEntry, loadFeedback, saveFeedback } from "./lib/data-store.mjs";
import { readJson, writeJsonAtomic } from "./lib/file-store.mjs";
import { createCopyId, createLedgerId, createStableId, createTaskId, createTopicId, createToolId, createUserId, todayString } from "./lib/ids.mjs";
import { hashText, normalizeText, createSimilarityFingerprint, extractExternalLinks } from "./lib/text-normalizer.mjs";
import { isProductHuntUrl, normalizeDomain } from "./lib/url-utils.mjs";
import { affiliateLinkMatchesTool } from "./lib/affiliate-links.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const OWNER_USER_ID = "user_owner";

export async function migrateCoreData() {
  await ensureCoreDataFiles();
  const inputs = await loadMigrationInputs();
  const core = {
    users: await loadCollection(CORE_COLLECTIONS.users),
    xAccounts: await loadCollection(CORE_COLLECTIONS.xAccounts),
    assignments: await loadCollection(CORE_COLLECTIONS.assignments),
    tools: await loadCollection(CORE_COLLECTIONS.tools),
    topics: await loadCollection(CORE_COLLECTIONS.topics),
    copyLibrary: await loadCollection(CORE_COLLECTIONS.copyLibrary),
    postTasks: await loadCollection(CORE_COLLECTIONS.postTasks),
    postLedger: await loadCollection(CORE_COLLECTIONS.postLedger),
    accountHealth: await loadCollection(CORE_COLLECTIONS.accountHealth),
    contentRules: await loadContentRules()
  };
  const { next, feedback, stats } = buildCoreMigration({ core, inputs });

  await Promise.all([
    saveCollection(CORE_COLLECTIONS.users, next.users),
    saveCollection(CORE_COLLECTIONS.xAccounts, next.xAccounts),
    saveCollection(CORE_COLLECTIONS.assignments, next.assignments),
    saveCollection(CORE_COLLECTIONS.tools, next.tools),
    saveCollection(CORE_COLLECTIONS.topics, next.topics),
    saveCollection(CORE_COLLECTIONS.copyLibrary, next.copyLibrary),
    saveCollection(CORE_COLLECTIONS.postTasks, next.postTasks),
    saveCollection(CORE_COLLECTIONS.postLedger, next.postLedger),
    saveCollection(CORE_COLLECTIONS.accountHealth, next.accountHealth),
    writeJsonAtomic(CONTENT_RULES_PATH, { ...next.contentRules, updatedAt: new Date().toISOString() }),
    saveFeedback(feedback)
  ]);

  return stats;
}

export function buildCoreMigration({ core, inputs }) {
  const now = new Date().toISOString();
  const stats = {
    toolsAdded: 0,
    toolsUpdated: 0,
    topicsAdded: 0,
    copiesAdded: 0,
    ledgerAdded: 0,
    tasksAdded: 0,
    feedbackNeedsLinking: 0,
    duplicatesSkipped: 0
  };
  const next = cloneCore(core);
  ensureOwner(next.users, now);
  migrateAccounts({ next, config: inputs.xAccountsConfig, now });
  ensureContentRules(next);

  const toolRecords = collectToolRecords(inputs);
  for (const record of toolRecords) {
    const tool = buildToolRecord(record, inputs.affiliateLinks, now);
    const existing = next.tools.items.find((item) => item.toolId === tool.toolId);
    if (existing) stats.toolsUpdated += 1;
    else stats.toolsAdded += 1;
    upsertById(next.tools.items, mergeTool(existing, tool), "toolId");

    for (const [variantType, copyText] of Object.entries(record.copyVariants ?? {})) {
      if (!copyText) continue;
      const topic = buildTopicRecord({ record, tool, variantType, now });
      if (!next.topics.items.some((item) => item.topicId === topic.topicId)) stats.topicsAdded += 1;
      upsertById(next.topics.items, topic, "topicId");

      const copy = buildCopyRecord({ topic, tool, variantType, copyText, now });
      if (next.copyLibrary.items.some((item) => item.copyId === copy.copyId || item.normalizedTextHash === copy.normalizedTextHash)) {
        stats.duplicatesSkipped += 1;
      } else {
        next.copyLibrary.items.push(copy);
        stats.copiesAdded += 1;
      }
    }
  }

  const feedbackEntries = (inputs.feedback.entries ?? []).map((entry) => migrateFeedbackEntry({ entry, next, inputs, now, stats }));
  return {
    next,
    feedback: { ...inputs.feedback, entries: feedbackEntries },
    stats
  };
}

async function loadMigrationInputs() {
  const [latest, history, feedback, accountPosts, xAccountsConfig, affiliateLinks] = await Promise.all([
    readJson("data/latest.json", null),
    readJson("data/history.json", { tools: [] }),
    loadFeedback(),
    readJson("data/account-posts.json", { items: [] }),
    readJson("config/x-accounts.json", { accounts: [], rotationPolicy: {} }),
    readJson("config/affiliate-links.json", { links: [] })
  ]);
  return {
    latest,
    dailySnapshots: await loadDailySnapshots(),
    history,
    feedback,
    accountPosts,
    xAccountsConfig,
    affiliateLinks
  };
}

async function loadDailySnapshots() {
  try {
    const dir = path.join(rootDir, "data/daily");
    const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
    const snapshots = [];
    for (const file of files) {
      snapshots.push(await readJson(path.join("data/daily", file), null));
    }
    return snapshots.filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function collectToolRecords(inputs) {
  const records = [];
  for (const snapshot of [inputs.latest, ...(inputs.dailySnapshots ?? [])].filter(Boolean)) {
    for (const item of [...(snapshot.tools ?? []), ...(snapshot.skippedTools ?? [])]) {
      records.push({ ...item, sourceDate: snapshot.date || item.sourceDate });
    }
  }
  for (const item of inputs.history.tools ?? []) {
    records.push({
      toolId: item.toolId,
      name: item.toolName,
      url: item.url,
      domain: item.domain,
      tagline: item.tagline,
      sourceDate: item.date,
      score: item.score,
      scoreBreakdown: item.scoreBreakdown,
      followUpAction: item.followUpAction,
      affiliateStatus: item.affiliateMatched ? "matched" : "research_needed"
    });
  }
  for (const entry of inputs.feedback.entries ?? []) {
    records.push({
      toolId: entry.toolId,
      name: entry.toolName,
      url: entry.toolUrl,
      sourceDate: entry.sourceDate,
      copyVariants: entry.copyText ? { [entry.variantType || "shortPost"]: entry.copyText } : {}
    });
  }
  return records.filter((item) => item.name && item.url);
}

function buildToolRecord(record, affiliateLinks, now) {
  const toolId = record.toolId || createToolId(record.name, record.url);
  const domain = record.domain || normalizeDomain(record.url);
  const matchedAffiliate = (affiliateLinks.links ?? []).find((link) => affiliateLinkMatchesTool({ name: record.name, url: record.url, tagline: record.tagline ?? "" }, link));
  const sourceDate = record.sourceDate || todayString();
  return {
    toolId,
    name: record.name,
    domain,
    productHuntUrl: isProductHuntUrl(record.url) ? record.url : "",
    officialUrl: isProductHuntUrl(record.url) ? "" : record.url,
    tagline: record.tagline || "",
    firstSeenAt: sourceDate,
    lastSeenAt: sourceDate,
    seenCount: 1,
    bestScore: Number(record.score || 0),
    latestScore: Number(record.score || 0),
    scoreBreakdown: record.scoreBreakdown ?? {},
    affiliateStatus: matchedAffiliate ? "matched" : record.affiliateStatus || "research_needed",
    affiliateLinkId: matchedAffiliate?.id || matchedAffiliate?.name || "",
    status: record.followUpAction === "skip" ? "rejected" : "new",
    sourceDates: [sourceDate].filter(Boolean),
    notes: "",
    createdAt: now,
    updatedAt: now
  };
}

function mergeTool(existing, incoming) {
  if (!existing) return incoming;
  const sourceDates = [...new Set([...(existing.sourceDates ?? []), ...(incoming.sourceDates ?? [])].filter(Boolean))].sort();
  return {
    ...existing,
    ...incoming,
    firstSeenAt: [existing.firstSeenAt, incoming.firstSeenAt].filter(Boolean).sort()[0] || incoming.firstSeenAt,
    lastSeenAt: [existing.lastSeenAt, incoming.lastSeenAt].filter(Boolean).sort().at(-1) || incoming.lastSeenAt,
    seenCount: Math.max(Number(existing.seenCount || 1), sourceDates.length || 1),
    bestScore: Math.max(Number(existing.bestScore || 0), Number(incoming.bestScore || 0)),
    latestScore: Number(incoming.latestScore || existing.latestScore || 0),
    productHuntUrl: existing.productHuntUrl || incoming.productHuntUrl,
    officialUrl: existing.officialUrl || incoming.officialUrl,
    sourceDates,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: incoming.updatedAt
  };
}

function buildTopicRecord({ record, tool, variantType, now }) {
  const angle = record.angle ?? {};
  const audience = angle.audience || record.accountRecommendation?.primary?.category || "";
  const painPoint = angle.pain || record.suggestedAngle || record.reason || "";
  const useCase = angle.outcome || record.tagline || "";
  return {
    topicId: createTopicId(tool.toolId, variantType, audience, painPoint, useCase),
    toolId: tool.toolId,
    angleType: variantType,
    audience,
    painPoint,
    useCase,
    sourceDate: record.sourceDate || todayString(),
    priorityScore: Number(record.score || 0),
    status: "new",
    duplicateGroupId: createStableId("dupgroup", [tool.toolId, variantType, normalizeText(painPoint)]),
    notes: "",
    createdAt: now,
    updatedAt: now
  };
}

function buildCopyRecord({ topic, tool, variantType, copyText, now }) {
  const normalizedText = normalizeText(copyText);
  return {
    copyId: createCopyId(topic.topicId, variantType, copyText),
    topicId: topic.topicId,
    toolId: tool.toolId,
    variantType,
    copyText,
    normalizedText,
    normalizedTextHash: hashText(copyText),
    similarityFingerprint: createSimilarityFingerprint(copyText),
    language: "en",
    status: "approved",
    riskFlags: String(copyText).length > 280 ? ["over_280_chars"] : [],
    usedByAccountIds: [],
    usedByTaskIds: [],
    createdAt: now,
    updatedAt: now
  };
}

function migrateFeedbackEntry({ entry, next, inputs, now, stats }) {
  const tool = ensureFeedbackTool({ entry, next, inputs, now, stats });
  const variantType = entry.variantType || "shortPost";
  const topic = buildTopicRecord({ record: { ...tool, ...entry, name: tool.name, url: tool.officialUrl || tool.productHuntUrl, angle: {} }, tool, variantType, now });
  upsertById(next.topics.items, topic, "topicId");
  const copyText = entry.copyText || "";
  const copy = copyText ? ensureCopy({ next, topic, tool, variantType, copyText, now, stats }) : null;
  const accountId = entry.accountId || "";
  const taskId = copy ? createTaskId(entry.sourceDate || todayString(), accountId, copy.copyId) : "";
  const hasMetrics = Object.values(entry.metrics ?? {}).some((value) => Number(value) > 0);
  const task = copy ? {
    taskId,
    date: entry.sourceDate || todayString(),
    workspaceId: entry.workspaceId || "workspace_default",
    accountId,
    assignedTo: OWNER_USER_ID,
    managerUserId: OWNER_USER_ID,
    toolId: tool.toolId,
    topicId: topic.topicId,
    copyId: copy.copyId,
    copyText,
    variantType,
    status: entry.posted === false ? "draft" : hasMetrics ? "feedback_done" : "feedback_due",
    approvalStatus: "approved",
    publishWindow: "",
    scheduledAt: "",
    copiedAt: "",
    postedAt: entry.postedAt || "",
    postedUrl: entry.postedUrl || "",
    feedbackDueAt: entry.postedAt || "",
    metrics: entry.metrics ?? {},
    duplicateCheckResult: {},
    riskFlags: [],
    notes: entry.notes || "Migrated from feedback.",
    createdAt: entry.createdAt || now,
    updatedAt: now
  } : null;
  if (task && !next.postTasks.items.some((item) => item.taskId === task.taskId)) {
    next.postTasks.items.push(task);
    stats.tasksAdded += 1;
  }

  const ledger = task && entry.posted !== false ? buildLedgerFromTask({ task, entry, copy, now }) : null;
  if (ledger && !next.postLedger.items.some((item) => item.ledgerId === ledger.ledgerId)) {
    next.postLedger.items.push(ledger);
    stats.ledgerAdded += 1;
  }

  if (!task || !copy) stats.feedbackNeedsLinking += 1;
  return buildFeedbackEntry({
    ...entry,
    workspaceId: entry.workspaceId || task?.workspaceId || "workspace_default",
    toolId: tool.toolId,
    taskId: task?.taskId || entry.taskId || "",
    copyId: copy?.copyId || entry.copyId || "",
    needsLinking: !task || !copy
  });
}

function ensureFeedbackTool({ entry, next, inputs, now, stats }) {
  const existing = next.tools.items.find((item) => item.toolId === entry.toolId || (entry.toolUrl && [item.officialUrl, item.productHuntUrl].includes(entry.toolUrl)));
  if (existing) return existing;
  const tool = buildToolRecord({
    toolId: entry.toolId,
    name: entry.toolName,
    url: entry.toolUrl,
    sourceDate: entry.sourceDate
  }, inputs.affiliateLinks, now);
  next.tools.items.push(tool);
  stats.toolsAdded += 1;
  return tool;
}

function ensureCopy({ next, topic, tool, variantType, copyText, now, stats }) {
  const normalizedTextHash = hashText(copyText);
  const existing = next.copyLibrary.items.find((item) => item.normalizedTextHash === normalizedTextHash);
  if (existing) return existing;
  const copy = buildCopyRecord({ topic, tool, variantType, copyText, now });
  next.copyLibrary.items.push(copy);
  stats.copiesAdded += 1;
  return copy;
}

function buildLedgerFromTask({ task, entry, copy, now }) {
  const externalLinks = extractExternalLinks(task.copyText);
  return {
    ledgerId: createLedgerId(task.taskId, entry.postedUrl || task.postedAt || task.copyId),
    taskId: task.taskId,
    workspaceId: task.workspaceId || entry.workspaceId || "workspace_default",
    accountId: task.accountId,
    employeeId: task.assignedTo,
    toolId: task.toolId,
    topicId: task.topicId,
    copyId: task.copyId,
    normalizedTextHash: copy.normalizedTextHash,
    postedText: task.copyText,
    postedUrl: entry.postedUrl || "",
    postedAt: entry.postedAt || now,
    externalLinks,
    affiliateLinkUsed: externalLinks.find((link) => /ref=|affiliate|partner/i.test(link)) || "",
    metrics: entry.metrics ?? {},
    createdAt: entry.createdAt || now,
    updatedAt: now
  };
}

function migrateAccounts({ next, config, now }) {
  for (const account of config.accounts ?? []) {
    const accountId = account.id || account.accountId;
    if (!accountId) continue;
    upsertById(next.xAccounts.items, {
      accountId,
      handle: account.handle || "",
      niche: account.category || account.description || "general",
      language: "en",
      status: account.active === false ? "paused" : "active",
      workspaceId: account.workspaceId || "workspace_default",
      ownerUserId: OWNER_USER_ID,
      managerUserId: OWNER_USER_ID,
      dailyPostLimit: Number(account.dailyPostLimit || config.rotationPolicy?.defaultDailyPostLimit || 1),
      externalLinkLimit: 1,
      publishMode: "manual",
      autoPublishEnabled: false,
      requiresFinalApproval: true,
      riskLevel: "low",
      persona: account.displayName || account.handle || accountId,
      contentStyle: (account.contentPillars ?? []).join(", "),
      notes: account.description || "",
      createdAt: now,
      updatedAt: now
    }, "accountId");
    upsertById(next.assignments.items, {
      assignmentId: createStableId("assignment", [OWNER_USER_ID, accountId]),
      workspaceId: account.workspaceId || "workspace_default",
      userId: OWNER_USER_ID,
      accountId,
      startDate: todayString(),
      endDate: "",
      active: true,
      notes: "Migrated from config/x-accounts.json",
      createdAt: now,
      updatedAt: now
    }, "assignmentId");
  }
}

function ensureOwner(users, now) {
  upsertById(users.items, {
    userId: OWNER_USER_ID,
    name: "Owner",
    role: "admin",
    active: true,
    workspaceId: "workspace_default",
    assignedAccountIds: [],
    notes: "Default admin created by Foundation v4 migration.",
    createdAt: now,
    updatedAt: now
  }, "userId");
}

function ensureContentRules(next) {
  next.contentRules = {
    ...DEFAULT_CONTENT_RULES,
    ...next.contentRules,
    rules: {
      ...DEFAULT_CONTENT_RULES.rules,
      ...(next.contentRules.rules ?? {})
    }
  };
}

function cloneCore(core) {
  return {
    users: structuredClone(core.users ?? emptyCollection()),
    xAccounts: structuredClone(core.xAccounts ?? emptyCollection()),
    assignments: structuredClone(core.assignments ?? emptyCollection()),
    tools: structuredClone(core.tools ?? emptyCollection()),
    topics: structuredClone(core.topics ?? emptyCollection()),
    copyLibrary: structuredClone(core.copyLibrary ?? emptyCollection()),
    postTasks: structuredClone(core.postTasks ?? emptyCollection()),
    postLedger: structuredClone(core.postLedger ?? emptyCollection()),
    accountHealth: structuredClone(core.accountHealth ?? emptyCollection()),
    contentRules: structuredClone(core.contentRules ?? DEFAULT_CONTENT_RULES)
  };
}

function printStats(stats) {
  console.log("Foundation v4 migration complete");
  console.log(`- Added tools: ${stats.toolsAdded}`);
  console.log(`- Updated tools: ${stats.toolsUpdated}`);
  console.log(`- Added topics: ${stats.topicsAdded}`);
  console.log(`- Added copy records: ${stats.copiesAdded}`);
  console.log(`- Added post tasks: ${stats.tasksAdded}`);
  console.log(`- Added ledger records: ${stats.ledgerAdded}`);
  console.log(`- Feedback needing linking: ${stats.feedbackNeedsLinking}`);
  console.log(`- Duplicates skipped: ${stats.duplicatesSkipped}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const stats = await migrateCoreData();
  printStats(stats);
}
