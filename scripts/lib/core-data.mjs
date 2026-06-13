import { readJson, writeJsonAtomic } from "./file-store.mjs";

export const CORE_COLLECTIONS = {
  users: "data/users.json",
  xAccounts: "data/x-accounts.json",
  assignments: "data/assignments.json",
  tools: "data/tools.json",
  topics: "data/topics.json",
  copyLibrary: "data/copy-library.json",
  postTasks: "data/post-tasks.json",
  postLedger: "data/post-ledger.json",
  accountHealth: "data/account-health.json"
};

export const CONTENT_RULES_PATH = "data/content-rules.json";

export const DEFAULT_CONTENT_RULES = {
  version: 1,
  updatedAt: "",
  rules: {
    maxSameToolPerDayGlobal: 3,
    maxSameDomainPerDayGlobal: 5,
    maxSameToolPerAccount7d: 1,
    maxSameDomainPerAccount7d: 1,
    maxExternalLinksPerAccountDay: 1,
    maxAffiliateLinkPerDayGlobal: 3,
    maxSameToolPerEmployeeDay: 2,
    minTextSimilarityDistance: 0.35,
    requireManualApproval: true,
    forbiddenWords: [],
    linkPolicy: "conservative"
  }
};

export function emptyCollection() {
  return { version: 1, updatedAt: "", items: [] };
}

export async function loadCollection(filePath) {
  const data = await readJson(filePath, emptyCollection());
  return normalizeCollection(data);
}

export async function saveCollection(filePath, collection) {
  await writeJsonAtomic(filePath, withUpdatedAt(normalizeCollection(collection)));
}

export async function ensureCoreDataFiles() {
  for (const filePath of Object.values(CORE_COLLECTIONS)) {
    const current = await loadCollection(filePath);
    await saveCollection(filePath, current);
  }
  const rules = await loadContentRules();
  await writeJsonAtomic(CONTENT_RULES_PATH, {
    ...DEFAULT_CONTENT_RULES,
    ...rules,
    rules: {
      ...DEFAULT_CONTENT_RULES.rules,
      ...(rules.rules ?? {})
    },
    updatedAt: new Date().toISOString()
  });
}

export async function loadContentRules() {
  const current = await readJson(CONTENT_RULES_PATH, DEFAULT_CONTENT_RULES);
  return {
    ...DEFAULT_CONTENT_RULES,
    ...current,
    rules: {
      ...DEFAULT_CONTENT_RULES.rules,
      ...(current.rules ?? {})
    }
  };
}

export async function loadCoreData() {
  const [
    users,
    xAccounts,
    assignments,
    tools,
    topics,
    copyLibrary,
    postTasks,
    postLedger,
    accountHealth,
    contentRules
  ] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.tools),
    loadCollection(CORE_COLLECTIONS.topics),
    loadCollection(CORE_COLLECTIONS.copyLibrary),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules()
  ]);

  return {
    users,
    xAccounts,
    assignments,
    tools,
    topics,
    copyLibrary,
    postTasks,
    postLedger,
    accountHealth,
    contentRules
  };
}

export function upsertById(items, item, idField) {
  const index = items.findIndex((current) => current[idField] === item[idField]);
  if (index >= 0) {
    const existing = items[index];
    items[index] = {
      ...existing,
      ...item,
      createdAt: existing.createdAt || item.createdAt,
      updatedAt: item.updatedAt || new Date().toISOString()
    };
    return { item: items[index], created: false };
  }
  items.push(item);
  return { item, created: true };
}

export function normalizeCollection(data) {
  return {
    version: Number(data?.version || 1),
    updatedAt: data?.updatedAt || "",
    items: Array.isArray(data?.items) ? data.items : []
  };
}

export function withUpdatedAt(collection) {
  return {
    ...collection,
    updatedAt: new Date().toISOString()
  };
}

export const ACTIVE_TASK_STATUSES = new Set([
  "pending_review",
  "approved",
  "assigned",
  "copied",
  "scheduled",
  "posted",
  "feedback_due"
]);
