import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDesktopAppDataDir, getDesktopSeedDataDir, repoRoot } from "../../desktop/app-config.mjs";

export async function cleanupDesktopRuntime({
  appDataDir = getDesktopAppDataDir(),
  seedDataDir = getDesktopSeedDataDir(repoRoot),
  backup = true,
  cleanSeed = true,
  now = new Date()
} = {}) {
  const dataDir = path.join(appDataDir, "data");
  let backupDir = "";
  if (backup) {
    backupDir = path.join(appDataDir, "backups", `runtime-cleanup-${timestamp(now)}`);
    await mkdir(path.dirname(backupDir), { recursive: true });
    await cp(dataDir, path.join(backupDir, "data"), { recursive: true, force: true });
  }

  const runtime = await cleanupDataDirectory(dataDir);
  const seed = cleanSeed ? await cleanupDataDirectory(seedDataDir) : { filesChanged: 0, itemsChanged: 0 };

  return {
    appDataDir,
    dataDir,
    backupDir,
    runtime,
    seed
  };
}

export async function cleanupDataDirectory(dataDir) {
  const files = await listJsonFiles(dataDir);
  let filesChanged = 0;
  let itemsChanged = 0;
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const before = await readFile(filePath, "utf8");
    let json;
    try {
      json = JSON.parse(before);
    } catch {
      continue;
    }
    const cleaned = cleanupJsonPayload(json, { file });
    const after = `${JSON.stringify(cleaned.value, null, 2)}\n`;
    if (after !== before) {
      await writeFile(filePath, after, "utf8");
      filesChanged += 1;
      itemsChanged += cleaned.changedCount;
    }
  }
  return { filesChanged, itemsChanged };
}

export function cleanupJsonPayload(value, context = {}) {
  let changedCount = 0;
  const connectedAccountIds = collectConnectedAccountIds(value);

  function visit(input, key = "") {
    if (Array.isArray(input)) return input.map((item) => visit(item, key));
    if (input && typeof input === "object") {
      const cleaned = {};
      for (const [childKey, childValue] of Object.entries(input)) {
        cleaned[childKey] = visit(childValue, childKey);
      }
      const normalized = normalizeKnownObject(cleaned, context, connectedAccountIds);
      if (JSON.stringify(normalized) !== JSON.stringify(input)) changedCount += 1;
      return normalized;
    }
    if (typeof input === "string") {
      const cleaned = key === "timezone" ? "" : cleanVisibleString(input);
      if (cleaned !== input) changedCount += 1;
      return cleaned;
    }
    return input;
  }

  return { value: visit(value), changedCount };
}

export function cleanVisibleString(value) {
  return String(value)
    .replace(/@demo_operator_(\d+)/g, "@creator_ops_$1")
    .replace(/\bdemo_operator_(\d+)\b/g, "creator_ops_$1")
    .replace(/\bdemo_ai_builder\b/g, "ai_builder_watch")
    .replace(/AI Creator OS Desktop Demo/g, "AI Creator OS 本地账号库")
    .replace(/Desktop Demo/g, "本地账号库")
    .replace(/Demo Staff/g, "Local Operator")
    .replace(/Desktop Owner/g, "Owner")
    .replace(/Demo account for desktop matrix view\./g, "Sample account for local account planning.")
    .replace(/Demo relationship target\. Replace with real manual research after onboarding\./g, "Sample target. Replace with manual research after onboarding.")
    .replace(/A demo AI support triage workflow for manager review\./g, "Sample AI support triage workflow for manual review.")
    .replace(/A demo SaaS pricing research board\./g, "Sample SaaS pricing research board.")
    .replace(/演示账号/g, "样例账号")
    .replace(/导入演示账号/g, "导入账号")
    .replace(/添加演示账号/g, "添加账号");
}

function normalizeKnownObject(item, context, connectedAccountIds) {
  if (isAccount(item)) return normalizeAccount(item, connectedAccountIds);
  if (context.file === "workspaces.json" && item.name) {
    return {
      ...item,
      name: cleanVisibleString(item.name)
    };
  }
  if (context.file === "users.json" && item.name) {
    return {
      ...item,
      name: cleanVisibleString(item.name)
    };
  }
  return item;
}

function normalizeAccount(account, connectedAccountIds) {
  const isOfficial = account.accountType === "official" || Boolean(account.oauthConnectionId) || connectedAccountIds.has(account.accountId);
  const country = cleanAccountCountry(account);
  return {
    ...account,
    handle: cleanVisibleString(account.handle || ""),
    persona: cleanVisibleString(account.persona || ""),
    notes: cleanVisibleString(account.notes || ""),
    country,
    countryManual: Boolean(country),
    region: "",
    timezone: "",
    connectionStatus: isOfficial && account.connectionStatus === "connected" ? "connected" : "not_connected"
  };
}

function cleanAccountCountry(account = {}) {
  const country = String(account.country || account.region || "").trim();
  if (!country) return "";
  if (isAutoDefaultCountry(country) && !account.countryManual) return "";
  return country;
}

function isAutoDefaultCountry(value = "") {
  return ["US", "UK", "EU", "HK", "SG", "JP"].includes(String(value || "").trim().toUpperCase());
}

function isAccount(item) {
  return Boolean(item?.accountId) && ("handle" in item || "connectionStatus" in item || "accountType" in item);
}

function collectConnectedAccountIds(value) {
  const ids = new Set();
  function visit(input) {
    if (Array.isArray(input)) {
      for (const item of input) visit(item);
      return;
    }
    if (!input || typeof input !== "object") return;
    if (input.accountId && input.status === "connected" && input.tokenRef) ids.add(input.accountId);
    for (const item of Object.values(input)) visit(item);
  }
  visit(value);
  return ids;
}

async function listJsonFiles(dir) {
  const entries = await readdir(dir).catch(() => []);
  return entries.filter((entry) => entry.endsWith(".json"));
}

function timestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const result = await cleanupDesktopRuntime();
  console.log("Desktop runtime cleanup completed.");
  console.log(`App data: ${result.appDataDir}`);
  console.log(`Runtime backup: ${result.backupDir}`);
  console.log(`Runtime files changed: ${result.runtime.filesChanged}`);
  console.log(`Seed files changed: ${result.seed.filesChanged}`);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
