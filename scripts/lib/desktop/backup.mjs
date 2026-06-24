import { access, cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDesktopAppDataDir, getDesktopSeedDataDir, repoRoot } from "../../../desktop/app-config.mjs";
import { readJson, resolveProjectPath, writeJsonAtomic } from "../file-store.mjs";
import { DESKTOP_AUDIT_PATH, DESKTOP_STATE_PATH } from "./constants.mjs";
import { appendDesktopAudit } from "./logging.mjs";
import { writeDesktopState } from "./internal.mjs";
import { loadDesktopSetupStatus } from "./setup.mjs";

export async function resetDesktopDemoData({ markSetupComplete = true, actor = { userId: "user_owner" } } = {}) {
  const seedDir = getDesktopSeedDataDir(repoRoot);
  const targetDir = resolveProjectPath("data");
  await mkdir(targetDir, { recursive: true });
  await cp(seedDir, targetDir, { recursive: true, force: true });
  if (markSetupComplete) {
    await writeDesktopState({ mode: "demo", workspaceId: "workspace_default", workspaceName: "AI Creator OS 样例账号库" });
  }
  await appendDesktopAudit({
    type: "desktop.demo.reset",
    workspaceId: "workspace_default",
    actorUserId: actor.userId,
    summary: "Desktop demo data reset."
  });
  return loadDesktopSetupStatus();
}

export async function exportDesktopBackupPackage(options = {}) {
  const appDataDir = options.appDataDir || process.env.AI_CREATOR_OS_DATA_DIR || getDesktopAppDataDir();
  const backupDir = options.outputDir || path.join(appDataDir, "backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = options.outputPath || path.join(backupDir, `ai-creator-os-backup-${stamp}.json`);
  const files = {};
  for (const file of await listRuntimeJsonFiles()) {
    files[file] = await readJson(file, null);
  }
  const payload = {
    version: 1,
    product: "AI Creator OS Desktop",
    exportedAt: new Date().toISOString(),
    appDataDir,
    files
  };
  await writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await appendDesktopAudit({
    type: "desktop.backup.export",
    workspaceId: "workspace_default",
    actorUserId: "user_owner",
    targetId: backupPath,
    summary: "Desktop backup exported."
  });
  return { path: backupPath, files: Object.keys(files).length };
}

export async function importDesktopBackup(input = {}, actor = { userId: "user_owner" }) {
  const payload = typeof input.backupText === "string" && input.backupText.trim()
    ? JSON.parse(input.backupText)
    : input.backup;
  if (!payload || payload.version !== 1 || !payload.files || typeof payload.files !== "object") {
    throw new Error("备份格式无效。");
  }
  const restored = [];
  for (const [file, data] of Object.entries(payload.files)) {
    if (!/^data\/[a-z0-9_./-]+\.json$/i.test(file)) continue;
    await writeJsonAtomic(file, data);
    restored.push(file);
  }
  await appendDesktopAudit({
    type: "desktop.backup.import",
    workspaceId: input.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    summary: `Desktop backup imported (${restored.length} files).`
  });
  return { restored };
}

async function listRuntimeJsonFiles() {
  const paths = [
    DESKTOP_STATE_PATH,
    DESKTOP_AUDIT_PATH,
    "data/workspaces.json",
    "data/users.json",
    "data/x-accounts.json",
    "data/assignments.json",
    "data/post-tasks.json",
    "data/post-ledger.json",
    "data/feedback.json",
    "data/relationship-targets.json",
    "data/account-health.json",
    "data/content-lanes.json",
    "data/workspace-lanes.json",
    "data/tools.json",
    "data/topics.json",
    "data/copy-library.json",
    "data/publish-settings.json",
    "data/publish-jobs.json",
    "data/publish-attempts.json",
    "data/x-connections.json",
    "data/subscriptions.json",
    "data/user-identities.json"
  ];
  const existing = [];
  for (const filePath of paths) {
    try {
      await access(resolveProjectPath(filePath));
      existing.push(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return existing;
}
