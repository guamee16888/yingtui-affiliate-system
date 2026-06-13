import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./file-store.mjs";

const DEMO_DEPLOYMENT = {
  mode: "demo",
  readOnly: true,
  note: "当前是公开演示环境，只能查看和复制，不能保存审核、反馈或发布。真实运营请使用私有服务端。"
};

const POSTED_URL_KEYS = new Set(["postedUrl", "tweetUrl", "tweetPermalink", "postUrl", "xUrl", "permalink"]);
const CLEAR_KEYS = new Set(["notes", "requestSummary", "responseSummary", "xPostId", "xUserId", "accessToken", "refreshToken", "clientSecret", "client_secret", "apiKey", "api_key", "secret", "password"]);

export function demoDeployment() {
  return { ...DEMO_DEPLOYMENT };
}

export async function sanitizeDemoData(options = {}) {
  const sourceDataDir = options.sourceDataDir ?? path.join(rootDir, "data");
  const sourceConfigDir = options.sourceConfigDir ?? path.join(rootDir, "config");
  const targetDataDir = options.targetDataDir ?? path.join(rootDir, "data-demo");
  const targetConfigDir = options.targetConfigDir ?? path.join(rootDir, "config-demo");
  const now = options.now ?? new Date().toISOString();
  const accountHandles = new Map();
  const stats = { dataFiles: 0, configFiles: 0 };

  await rm(targetDataDir, { recursive: true, force: true });
  await rm(targetConfigDir, { recursive: true, force: true });
  await mkdir(targetDataDir, { recursive: true });
  await mkdir(targetConfigDir, { recursive: true });

  for (const filePath of await listFiles(sourceDataDir)) {
    const relativePath = path.relative(sourceDataDir, filePath);
    if (relativePath.split(path.sep).includes("backups")) continue;
    const targetPath = path.join(targetDataDir, relativePath);
    if (!filePath.endsWith(".json")) {
      await copyDemoFile(filePath, targetPath);
      continue;
    }
    const json = await readJsonFile(filePath);
    const sanitized = sanitizeJson(json, { relativePath, now, accountHandles, area: "data" });
    await writeJsonFile(targetPath, sanitized);
    stats.dataFiles += 1;
  }

  for (const filePath of await listFiles(sourceConfigDir)) {
    const relativePath = path.relative(sourceConfigDir, filePath);
    const targetPath = path.join(targetConfigDir, relativePath);
    if (!filePath.endsWith(".json")) {
      await copyDemoFile(filePath, targetPath);
      continue;
    }
    const json = await readJsonFile(filePath);
    const sanitized = sanitizeJson(json, { relativePath, now, accountHandles, area: "config" });
    await writeJsonFile(targetPath, sanitized);
    stats.configFiles += 1;
  }

  return {
    ...stats,
    targetDataDir,
    targetConfigDir,
    deployment: demoDeployment()
  };
}

export function sanitizeJson(json, context = {}) {
  const relativePath = normalizePath(context.relativePath || "");
  const baseContext = {
    ...context,
    accountHandles: context.accountHandles ?? new Map(),
    now: context.now ?? new Date().toISOString()
  };

  let sanitized = deepSanitize(json, baseContext);

  if (relativePath === "users.json") sanitized = sanitizeUsers(sanitized, baseContext);
  if (relativePath === "x-accounts.json") sanitized = baseContext.area === "config"
    ? sanitizeConfigXAccounts(sanitized, baseContext)
    : sanitizeXAccounts(sanitized, baseContext);
  if (relativePath === "workspaces.json") sanitized = sanitizeWorkspaces(sanitized, baseContext);
  if (relativePath === "post-tasks.json") sanitized = sanitizePostTasks(sanitized);
  if (relativePath === "post-ledger.json") sanitized = sanitizePostLedger(sanitized);
  if (relativePath === "feedback.json") sanitized = sanitizeFeedback(sanitized);
  if (relativePath === "account-posts.json") sanitized = sanitizeAccountPosts(sanitized);
  if (relativePath === "x-connections.json") sanitized = sanitizeXConnections(sanitized, baseContext);
  if (relativePath === "publish-attempts.json") sanitized = sanitizePublishAttempts(sanitized);
  if (relativePath === "publish-settings.json") sanitized = sanitizePublishSettings(sanitized);
  if (relativePath === "affiliate-links.json") sanitized = sanitizeAffiliateLinks(sanitized);
  if (relativePath === "source-connectors.json") sanitized = sanitizeSourceConnectors(sanitized);

  return markDemo(sanitized, baseContext.now);
}

function sanitizeUsers(data, context) {
  return mapCollection(data, (user, index) => ({
    ...user,
    name: user.role === "staff" ? `Demo Staff ${index + 1}` : `Demo Manager ${index + 1}`,
    notes: "",
    workspaceId: user.workspaceId || "workspace_default",
    demo: true
  }), context.now);
}

function sanitizeXAccounts(data, context) {
  return mapCollection(data, (account, index) => {
    const handle = demoHandle(account.accountId, index, context.accountHandles);
    return {
      ...account,
      handle,
      persona: account.persona ? `Demo ${account.persona}` : `Demo Account ${index + 1}`,
      notes: "",
      workspaceId: account.workspaceId || "workspace_default",
      demo: true
    };
  }, context.now);
}

function sanitizeConfigXAccounts(data, context) {
  const accounts = (data.accounts ?? []).map((account, index) => ({
    ...account,
    displayName: account.displayName ? `Demo ${account.displayName}` : `Demo Account ${index + 1}`,
    handle: demoHandle(account.id, index, context.accountHandles),
    description: "Demo account profile for public read-only mode.",
    demo: true
  }));
  return {
    ...data,
    mode: "demo",
    demo: true,
    rotationPolicy: {
      ...(data.rotationPolicy ?? {}),
      notes: "Demo only. OAuth tokens are not included."
    },
    accounts
  };
}

function sanitizeWorkspaces(data, context) {
  const items = (data.items ?? []).slice(0, 1).map((workspace) => ({
    ...workspace,
    workspaceId: workspace.workspaceId === "workspace_demo" ? "workspace_demo" : "workspace_default",
    name: "Demo Workspace",
    plan: "demo",
    managerUserIds: workspace.managerUserIds?.length ? workspace.managerUserIds : ["user_owner"],
    staffUserIds: workspace.staffUserIds?.length ? workspace.staffUserIds : ["user_owner"],
    autoPublishEnabled: false,
    requiresFinalApproval: true,
    demo: true
  }));
  return {
    ...data,
    version: Number(data.version || 1),
    updatedAt: context.now,
    mode: "demo",
    demo: true,
    items
  };
}

function sanitizePostTasks(data) {
  return mapCollection(data, (task) => ({
    ...task,
    copyText: demoCopy(task.toolName, task.laneId),
    postedUrl: "",
    notes: "",
    demo: true
  }));
}

function sanitizePostLedger(data) {
  return mapCollection(data, (item) => ({
    ...item,
    postedUrl: "",
    xPostId: "",
    postedText: demoCopy(item.toolName, item.laneId),
    metrics: demoMetrics(item.metrics),
    demo: true
  }));
}

function sanitizeFeedback(data) {
  const entries = (data.entries ?? []).map((entry) => ({
    ...entry,
    copyText: demoCopy(entry.toolName, entry.laneId),
    postedUrl: "",
    notes: "",
    metrics: demoMetrics(entry.metrics),
    demo: true
  }));
  return {
    ...data,
    mode: "demo",
    demo: true,
    entries
  };
}

function sanitizeAccountPosts(data) {
  return mapCollection(data, (item) => ({
    ...item,
    copyText: demoCopy(item.toolName, item.laneId),
    postedUrl: "",
    notes: "",
    demo: true
  }));
}

function sanitizeXConnections(data, context) {
  return mapCollection(data, (connection, index) => ({
    ...connection,
    handle: demoHandle(connection.accountId, index, context.accountHandles),
    xUserId: "",
    status: "not_connected",
    tokenRef: "demo_only",
    scopes: [],
    error: "",
    demo: true
  }), context.now);
}

function sanitizePublishAttempts(data) {
  return mapCollection(data, (attempt) => ({
    ...attempt,
    postedUrl: "",
    xPostId: "",
    requestSummary: {},
    responseSummary: {},
    error: attempt.error ? "Demo attempt error placeholder." : "",
    demo: true
  }));
}

function sanitizePublishSettings(data) {
  return {
    ...data,
    mode: "demo",
    demo: true,
    settings: {
      ...(data.settings ?? {}),
      globalAutoPublishEnabled: false,
      dryRunByDefault: true,
      allowedPublishModes: (data.settings?.allowedPublishModes ?? ["manual", "scheduled"]).filter((mode) => mode !== "auto"),
      defaultPublishMode: "manual"
    }
  };
}

function sanitizeAffiliateLinks(data) {
  return {
    ...data,
    mode: "demo",
    demo: true,
    links: []
  };
}

function sanitizeSourceConnectors(data) {
  return mapCollection(data, (connector) => ({
    connectorId: connector.connectorId,
    name: connector.name,
    type: connector.type,
    status: connector.status,
    laneIds: connector.laneIds ?? [],
    qualityTier: connector.qualityTier || "",
    notes: "",
    demo: true
  }));
}

function deepSanitize(value, context, key = "") {
  if (Array.isArray(value)) return value.map((item) => deepSanitize(item, context, key));
  if (!value || typeof value !== "object") return sanitizeScalar(value, key);
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => {
    if (POSTED_URL_KEYS.has(entryKey)) return [entryKey, ""];
    if (entryKey === "tokenRef") return [entryKey, "demo_only"];
    if (CLEAR_KEYS.has(entryKey) || /token|secret|password|apiKey|api_key|clientSecret|client_secret/i.test(entryKey)) {
      return [entryKey, entryKey === "tokenRef" ? "demo_only" : ""];
    }
    return [entryKey, deepSanitize(entryValue, context, entryKey)];
  }));
}

function sanitizeScalar(value, key) {
  if (typeof value !== "string") return value;
  let next = value.replace(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s"',)]+\/status\/[0-9]+/gi, "");
  if (POSTED_URL_KEYS.has(key)) return "";
  return next;
}

function markDemo(data, now) {
  if (Array.isArray(data) || !data || typeof data !== "object") return data;
  return {
    ...data,
    mode: "demo",
    demo: true,
    updatedAt: data.updatedAt ?? now
  };
}

function mapCollection(data, mapper, now = new Date().toISOString()) {
  return {
    ...data,
    version: Number(data.version || 1),
    updatedAt: now,
    mode: "demo",
    demo: true,
    items: (data.items ?? []).map(mapper)
  };
}

function demoHandle(accountId, index, accountHandles) {
  if (accountId && accountHandles.has(accountId)) return accountHandles.get(accountId);
  const handle = `@demo_ai_${String(accountHandles.size + 1).padStart(3, "0")}`;
  if (accountId) accountHandles.set(accountId, handle);
  return handle;
}

function demoCopy(toolName = "this topic", laneId = "demo") {
  const name = String(toolName || "this topic").slice(0, 70);
  return `Demo copy for ${name}: one practical observation for ${laneId || "the selected lane"}, written for review before posting.`;
}

function demoMetrics(metrics = {}) {
  return {
    impressions: Number(metrics.impressions || metrics.views || 120),
    likes: Number(metrics.likes || 4),
    bookmarks: Number(metrics.bookmarks || metrics.saves || 1),
    replies: Number(metrics.replies || 0),
    reposts: Number(metrics.reposts || 0),
    clicks: Number(metrics.clicks || 0),
    profileVisits: Number(metrics.profileVisits || 0),
    demo: true
  };
}

async function listFiles(dirPath) {
  try {
    const entries = await import("node:fs/promises").then((fs) => fs.readdir(dirPath, { withFileTypes: true }));
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) files.push(...await listFiles(fullPath));
      else if (entry.isFile()) files.push(fullPath);
    }
    return files;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function copyDemoFile(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
