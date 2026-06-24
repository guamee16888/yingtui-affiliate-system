import path from "node:path";
import { getDesktopAppDataDir } from "../../../desktop/app-config.mjs";
import { CORE_COLLECTIONS, emptyCollection, loadCollection, saveCollection } from "../core-data.mjs";
import { readJson, writeJsonAtomic } from "../file-store.mjs";
import { slugify } from "../ids.mjs";
import { SOURCE_LANE_FILES } from "../source-lanes.mjs";
import { DESKTOP_ACCOUNT_TARGET, DESKTOP_AUDIT_PATH, DESKTOP_STATE_PATH } from "./constants.mjs";
import { importDesktopAccounts } from "./accounts.mjs";
import { importDesktopBackup, resetDesktopDemoData } from "./backup.mjs";
import { appendDesktopAudit } from "./logging.mjs";
import { existingById, normalizeLanes, upsertCollection, upsertItem, writeDesktopState } from "./internal.mjs";

export async function loadDesktopSetupStatus(options = {}) {
  const appDataDir = options.appDataDir || getDesktopAppDataDir(process.platform, process.env);
  const state = await readJson(DESKTOP_STATE_PATH, null);
  return {
    version: 1,
    appDataDir,
    dataDir: path.join(appDataDir, "data"),
    logsDir: path.join(appDataDir, "logs"),
    setupCompleted: Boolean(state?.setupCompleted),
    mode: state?.mode || "not_completed",
    workspaceId: state?.workspaceId || "workspace_default",
    workspaceName: state?.workspaceName || "",
    updatedAt: state?.updatedAt || "",
    desktopMode: process.env.AI_CREATOR_OS_DESKTOP === "1",
    storageMode: process.env.APP_STORAGE_MODE || "json"
  };
}

export async function completeDesktopSetup(input = {}, actor = { userId: "user_owner" }) {
  const mode = String(input.mode || "demo").trim();
  if (mode === "demo") {
    await resetDesktopDemoData({ markSetupComplete: true, actor });
    return loadDesktopSetupStatus();
  }
  if (mode === "restore") {
    await importDesktopBackup(input, actor);
    await writeDesktopState({ mode: "restored", workspaceId: input.workspaceId || "workspace_default", workspaceName: input.workspaceName || "Restored Workspace" });
    return loadDesktopSetupStatus();
  }

  await initializeEmptyDesktopData();
  const workspace = await createOrUpdateDesktopWorkspace({
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName || "My Workspace",
    defaultLanguage: input.defaultLanguage || "en",
    defaultCountry: input.defaultCountry || "",
    defaultDailyPostLimit: input.defaultDailyPostLimit || 10,
    enabledLaneIds: input.enabledLaneIds || input.defaultLanes || ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"]
  }, actor);
  if (input.accountsText || input.csv) {
    await importDesktopAccounts({
      workspaceId: workspace.workspaceId,
      text: input.accountsText || "",
      csv: input.csv || "",
      defaultLane: input.defaultLane || workspace.enabledLaneIds?.[0] || "ai_startups",
      defaultLanguage: input.defaultLanguage || "en",
      defaultCountry: input.defaultCountry || "",
      defaultDailyPostLimit: input.defaultDailyPostLimit || 10
    }, actor);
  }
  await writeDesktopState({ mode: mode || "empty_workspace", workspaceId: workspace.workspaceId, workspaceName: workspace.name });
  await appendDesktopAudit({
    type: "desktop.setup.complete",
    workspaceId: workspace.workspaceId,
    actorUserId: actor.userId,
    summary: `Desktop setup completed in ${mode || "empty_workspace"} mode.`
  });
  return loadDesktopSetupStatus();
}

async function initializeEmptyDesktopData() {
  const collectionFiles = [
    ...Object.values(CORE_COLLECTIONS),
    SOURCE_LANE_FILES.workspaces,
    SOURCE_LANE_FILES.workspaceLanes,
    "data/publish-jobs.json",
    "data/publish-attempts.json",
    "data/x-connections.json"
  ];
  await Promise.all(collectionFiles.map((filePath) => saveCollection(filePath, emptyCollection())));
  await Promise.all([
    writeJsonAtomic("data/feedback.json", { version: 1, updatedAt: new Date().toISOString(), entries: [] }),
    writeJsonAtomic("data/relationship-targets.json", emptyCollection()),
    writeJsonAtomic(DESKTOP_AUDIT_PATH, emptyCollection())
  ]);
}

export async function createOrUpdateDesktopWorkspace(input = {}, actor = { userId: "user_owner" }) {
  const now = new Date().toISOString();
  const workspaceName = String(input.workspaceName || input.name || "My Workspace").trim();
  const workspaceId = String(input.workspaceId || `workspace_${slugify(workspaceName)}`).trim();
  const enabledLaneIds = normalizeLanes(input.enabledLaneIds);
  const workspaces = await loadCollection(SOURCE_LANE_FILES.workspaces);
  const users = await loadCollection(CORE_COLLECTIONS.users);
  const subscriptions = await readJson("data/subscriptions.json", { version: 1, updatedAt: "", items: [] });
  const workspace = {
    workspaceId,
    name: workspaceName,
    plan: "desktop",
    accountLimit: DESKTOP_ACCOUNT_TARGET,
    managerUserIds: ["user_owner"],
    staffUserIds: ["user_owner"],
    enabledLaneIds,
    defaultLanguage: input.defaultLanguage || "en",
    defaultCountry: input.defaultCountry || "",
    defaultTimezone: input.defaultTimezone || "",
    defaultDailyPostLimit: Number(input.defaultDailyPostLimit || 10),
    publishMode: "manual",
    autoPublishEnabled: false,
    requiresFinalApproval: true,
    active: true,
    createdAt: existingById(workspaces.items, "workspaceId", workspaceId)?.createdAt || now,
    updatedAt: now
  };
  await saveCollection(SOURCE_LANE_FILES.workspaces, upsertCollection(workspaces, workspace, "workspaceId"));
  await saveCollection(CORE_COLLECTIONS.users, upsertCollection(users, {
    userId: "user_owner",
    email: "owner@guamee.local",
    name: "Owner",
    role: "manager",
    workspaceId,
    active: true
  }, "userId"));
  await writeJsonAtomic("data/subscriptions.json", {
    ...subscriptions,
    updatedAt: now,
    items: upsertItem(subscriptions.items || [], {
      workspaceId,
      plan: "desktop",
      status: "internal",
      requireDiscordVerification: false,
      maxAccounts: DESKTOP_ACCOUNT_TARGET,
      maxSeats: 5,
      expiresAt: ""
    }, "workspaceId")
  });
  await appendDesktopAudit({
    type: "workspace.upsert",
    workspaceId,
    actorUserId: actor.userId,
    targetId: workspaceId,
    summary: "Desktop workspace saved."
  });
  return workspace;
}
