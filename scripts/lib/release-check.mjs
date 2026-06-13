import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./file-store.mjs";

const SECRET_PATTERN = /X_CLIENT_SECRET|X_TOKEN|OPENAI_API_KEY|API_KEY|access_token|refresh_token|client_secret|Bearer\s+[A-Za-z0-9._-]+/i;
const REAL_POSTED_URL_PATTERN = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?!you\/status\/123)[^"'\s)]+\/status\/[0-9]+/i;
const DEMO_HANDLE_PATTERN = /^$|^@demo_[a-z0-9]+_\d{3}$/i;

export async function runReleaseCheck(options = {}) {
  const distDir = options.distDir ?? path.join(rootDir, "dist");
  const passed = [];
  const warnings = [];
  const errors = [];

  await checkExists(distDir, "dist exists", errors, passed);
  const dataDir = path.join(distDir, "data");
  await checkExists(dataDir, "dist/data exists", errors, passed);
  if (errors.length) return { passed, warnings, errors };

  const files = await listFiles(distDir);
  const envFiles = files.filter((file) => path.basename(file).startsWith(".env"));
  if (envFiles.length) errors.push(`dist contains env file(s): ${envFiles.map((file) => path.relative(distDir, file)).join(", ")}`);
  else passed.push("dist does not contain .env files");

  const textMatches = [];
  for (const file of files.filter((item) => item.endsWith(".json") || item.endsWith(".html") || item.endsWith(".js") || item.endsWith(".md") || item.endsWith(".txt"))) {
    const relative = path.relative(distDir, file);
    const text = await readFile(file, "utf8");
    if (SECRET_PATTERN.test(text)) textMatches.push(relative);
  }
  if (textMatches.length) errors.push(`dist contains secret-like strings: ${textMatches.join(", ")}`);
  else passed.push("dist contains no raw secret-like strings");

  await checkDemoModeFiles(dataDir, errors, passed);
  await checkXConnections(dataDir, errors, passed);
  await checkUsers(dataDir, errors, passed);
  await checkXAccounts(dataDir, errors, passed);
  await checkPostedUrls(dataDir, "post-ledger.json", "items", errors, passed);
  await checkPostedUrls(dataDir, "feedback.json", "entries", errors, passed);
  await checkAffiliateLinks(distDir, errors, passed);
  await checkPublishSettings(dataDir, errors, passed);
  await checkWorkspaces(dataDir, errors, passed);
  await checkSourceConnectors(dataDir, errors, passed);
  await checkPages(distDir, errors, passed);
  await checkStaticApis(distDir, errors, passed);

  return { passed, warnings, errors };
}

export function formatReleaseCheckReport(result) {
  const lines = [
    "Release safety check",
    `passed: ${result.passed.length}`,
    ...result.passed.slice(0, 20).map((item) => `- ${item}`),
    result.passed.length > 20 ? `- ...${result.passed.length - 20} more passed checks` : "",
    `warnings: ${result.warnings.length}`,
    ...result.warnings.map((item) => `- ${item}`),
    `errors: ${result.errors.length}`,
    ...result.errors.map((item) => `- ${item}`)
  ].filter(Boolean);
  return lines.join("\n");
}

async function checkExists(filePath, label, errors, passed) {
  try {
    await stat(filePath);
    passed.push(label);
  } catch {
    errors.push(`Missing ${label}`);
  }
}

async function checkDemoModeFiles(dataDir, errors, passed) {
  const files = (await listFiles(dataDir)).filter((file) => file.endsWith(".json"));
  let missing = 0;
  for (const file of files) {
    const json = await readJsonFile(file, null);
    if (!json || json.mode !== "demo" || json.demo !== true) missing += 1;
  }
  if (missing) errors.push(`${missing} dist/data JSON file(s) are missing mode=demo/demo=true`);
  else passed.push("all dist/data JSON files are marked demo");
}

async function checkXConnections(dataDir, errors, passed) {
  const data = await readJsonFile(path.join(dataDir, "x-connections.json"), { items: [] });
  for (const connection of data.items ?? []) {
    if (connection.status !== "not_connected") errors.push(`demo x connection is not disabled: ${connection.connectionId || connection.accountId}`);
    if (connection.tokenRef && connection.tokenRef !== "demo_only") errors.push(`demo x connection exposes tokenRef: ${connection.connectionId || connection.accountId}`);
    if (connection.xUserId) errors.push(`demo x connection exposes xUserId: ${connection.connectionId || connection.accountId}`);
  }
  passed.push("x-connections are demo-safe");
}

async function checkUsers(dataDir, errors, passed) {
  const data = await readJsonFile(path.join(dataDir, "users.json"), { items: [] });
  for (const user of data.items ?? []) {
    if (!/^Demo (Manager|Staff|User) \d+/i.test(user.name || "")) errors.push(`non-demo user name in dist: ${user.userId || user.name}`);
    if (user.notes) errors.push(`demo user notes are not empty: ${user.userId}`);
  }
  passed.push("users are anonymized");
}

async function checkXAccounts(dataDir, errors, passed) {
  const data = await readJsonFile(path.join(dataDir, "x-accounts.json"), { items: [] });
  for (const account of data.items ?? []) {
    if (!DEMO_HANDLE_PATTERN.test(account.handle || "")) errors.push(`real-looking X handle in dist: ${account.accountId} ${account.handle}`);
    if (account.notes) errors.push(`demo x account notes are not empty: ${account.accountId}`);
  }
  passed.push("x-accounts are anonymized");
}

async function checkPostedUrls(dataDir, fileName, collectionKey, errors, passed) {
  const data = await readJsonFile(path.join(dataDir, fileName), { [collectionKey]: [] });
  for (const item of data[collectionKey] ?? []) {
    if (item.postedUrl && REAL_POSTED_URL_PATTERN.test(item.postedUrl)) errors.push(`${fileName} contains real postedUrl: ${item.id || item.ledgerId || item.taskId}`);
    if (item.xPostId) errors.push(`${fileName} contains xPostId: ${item.id || item.ledgerId || item.taskId}`);
  }
  passed.push(`${fileName} has no real posted URLs`);
}

async function checkAffiliateLinks(distDir, errors, passed) {
  const data = await readJsonFile(path.join(distDir, "config", "affiliate-links.json"), { links: [] });
  const raw = JSON.stringify(data);
  if (/https?:\/\//i.test(raw) && !/demo_placeholder/i.test(raw)) errors.push("dist/config/affiliate-links.json appears to contain a real affiliate URL");
  else passed.push("affiliate links are demo-safe");
}

async function checkPublishSettings(dataDir, errors, passed) {
  const data = await readJsonFile(path.join(dataDir, "publish-settings.json"), { settings: {} });
  if (data.settings?.globalAutoPublishEnabled !== false) errors.push("globalAutoPublishEnabled must be false in demo build");
  else passed.push("global auto publish is disabled");
  if (data.settings?.dryRunByDefault !== true) errors.push("dryRunByDefault must be true in demo build");
  else passed.push("dry-run default is enabled");
  if ((data.settings?.allowedPublishModes ?? []).includes("auto")) errors.push("demo build must not allow auto publish mode");
  else passed.push("auto publish mode is not allowed in demo build");
}

async function checkWorkspaces(dataDir, errors, passed) {
  const data = await readJsonFile(path.join(dataDir, "workspaces.json"), { items: [] });
  const items = data.items ?? [];
  if (items.length !== 1) errors.push(`demo build must contain exactly one workspace, found ${items.length}`);
  const workspace = items[0] ?? {};
  if (!["workspace_default", "workspace_demo"].includes(workspace.workspaceId)) errors.push(`private workspace id in demo build: ${workspace.workspaceId}`);
  if (workspace.name !== "Demo Workspace") errors.push(`workspace name is not demo-safe: ${workspace.name}`);
  passed.push("workspace data is demo-scoped");
}

async function checkSourceConnectors(dataDir, errors, passed) {
  const data = await readJsonFile(path.join(dataDir, "source-connectors.json"), { items: [] });
  const raw = JSON.stringify(data);
  if (/apiKey|api_key|secret|token/i.test(raw)) errors.push("source-connectors contains secret-like fields");
  else passed.push("source connectors do not expose secrets");
}

async function checkPages(distDir, errors, passed) {
  const expectations = [
    ["index.html", /只读演示/],
    ["dashboard/index.html", /modeBanner/],
    ["manager/index.html", /modeBanner/],
    ["staff/index.html", /modeBanner/]
  ];
  for (const [relative, pattern] of expectations) {
    const text = await readFile(path.join(distDir, relative), "utf8");
    if (!pattern.test(text)) errors.push(`${relative} does not expose demo/read-only mode marker`);
    else passed.push(`${relative} exposes demo/read-only marker`);
  }
}

async function checkStaticApis(distDir, errors, passed) {
  for (const relative of ["api/manager/summary", "api/staff/summary"]) {
    const data = await readJsonFile(path.join(distDir, relative), null);
    if (!data?.data?.deployment?.readOnly || data?.data?.deployment?.mode !== "demo") {
      errors.push(`${relative} is not marked as demo read-only`);
    } else {
      passed.push(`${relative} is demo read-only`);
    }
  }
}

async function listFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error.code === "ENOENT") return fallback;
    throw error;
  }
}
