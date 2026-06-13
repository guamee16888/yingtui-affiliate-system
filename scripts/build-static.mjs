import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./lib/file-store.mjs";
import { buildManagerSummary } from "./lib/manager-system.mjs";
import { buildStaffSummary } from "./lib/staff-system.mjs";
import { demoDeployment } from "./lib/demo-sanitize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const demoMode = process.argv.includes("--demo") || process.env.AI_CREATOR_OS_BUILD_MODE === "demo";
const dataDirName = demoMode ? "data-demo" : "data";
const configDirName = demoMode ? "config-demo" : "config";
const staticDeployment = demoMode
  ? demoDeployment()
  : {
      mode: "static_cloudflare",
      readOnly: true,
      note: "Cloudflare 静态演示模式：可以查看和复制，审核/发布/写入请回到本地 4174。"
    };
let staticDataCache = null;

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const dirname of ["dashboard", "staff", "manager", "public"]) {
  await cp(path.join(rootDir, dirname), path.join(distDir, dirname), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });
}

await cp(path.join(rootDir, dataDirName), path.join(distDir, "data"), {
  recursive: true,
  filter: (source) => !source.includes(`${path.sep}.DS_Store`) && !source.includes(`${path.sep}backups`)
});
await cp(path.join(rootDir, configDirName), path.join(distDir, "config"), {
  recursive: true,
  filter: (source) => !source.includes(`${path.sep}.DS_Store`)
});

if (!demoMode) {
  await cp(path.join(rootDir, "output"), path.join(distDir, "output"), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });
} else {
  await mkdir(path.join(distDir, "output"), { recursive: true });
  await writeFile(path.join(distDir, "output", "README.md"), "Demo mode: generated markdown exports are intentionally not published.\n", "utf8");
}

await cp(path.join(rootDir, "public", "index.html"), path.join(distDir, "index.html"));

const managerSummary = {
  ...(await buildStaticManagerSummary()),
  deployment: staticDeployment
};
await writeStaticApi("/api/manager/summary", managerSummary);
await writeStaticApi("/api/manager/tasks", managerSection(managerSummary, "tasks"));
await writeStaticApi("/api/manager/accounts", managerSection(managerSummary, "accounts"));
await writeStaticApi("/api/manager/staff", managerSection(managerSummary, "staff"));
await writeStaticApi("/api/manager/assignments", managerSection(managerSummary, "assignments"));
await writeStaticApi("/api/manager/publish-jobs", managerSection(managerSummary, "publishJobs"));
await writeStaticApi("/api/manager/feedback-debt", managerSection(managerSummary, "feedbackDebt"));
await writeStaticApi("/api/manager/lanes", managerSection(managerSummary, "lanes"));
await writeStaticApi("/api/manager/risks", managerSection(managerSummary, "risks"));
await writeStaticApi("/api/manager/settings", managerSection(managerSummary, "settings"));

const staffSummary = {
  ...(await buildStaticStaffSummary()),
  deployment: staticDeployment
};
await writeStaticApi("/api/staff/summary", staffSummary);

console.log(`Built ${demoMode ? "demo " : ""}static AI Creator OS site in ${distDir}`);

async function writeStaticApi(route, data) {
  const target = path.join(distDir, route.replace(/^\/+/, ""));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ ok: true, data }, null, 2), "utf8");
}

function managerSection(summary, section) {
  return {
    workspace: summary.selectedWorkspace,
    manager: summary.selectedManager,
    summary: summary.summary,
    deployment: staticDeployment,
    [section]: summary[section] ?? null
  };
}

async function buildStaticManagerSummary() {
  const data = await loadStaticData();
  return buildManagerSummary({
    workspaceId: "workspace_default",
    managerUserId: "user_owner",
    workspaces: data.workspaces.items,
    users: data.users.items,
    xAccounts: data.xAccounts.items,
    assignments: data.assignments.items,
    tasks: data.postTasks.items,
    ledger: data.postLedger.items,
    publishJobs: data.publishJobs.items,
    feedback: data.feedback.entries ?? [],
    contentLanes: data.contentLanes.items,
    workspaceLanes: data.workspaceLanes.items,
    rawCandidates: data.rawCandidates.items
  });
}

async function buildStaticStaffSummary() {
  const data = await loadStaticData();
  return buildStaffSummary({
    workspaceId: "workspace_default",
    userId: "user_owner",
    workspaces: data.workspaces.items,
    users: data.users.items,
    xAccounts: data.xAccounts.items,
    assignments: data.assignments.items,
    tasks: data.postTasks.items,
    ledger: data.postLedger.items
  });
}

async function loadStaticData() {
  if (staticDataCache) return staticDataCache;
  const base = demoMode ? "data-demo" : "data";
  staticDataCache = {
    workspaces: await readJson(`${base}/workspaces.json`, { items: [] }),
    users: await readJson(`${base}/users.json`, { items: [] }),
    xAccounts: await readJson(`${base}/x-accounts.json`, { items: [] }),
    assignments: await readJson(`${base}/assignments.json`, { items: [] }),
    postTasks: await readJson(`${base}/post-tasks.json`, { items: [] }),
    postLedger: await readJson(`${base}/post-ledger.json`, { items: [] }),
    publishJobs: await readJson(`${base}/publish-jobs.json`, { items: [] }),
    feedback: await readJson(`${base}/feedback.json`, { entries: [] }),
    contentLanes: await readJson(`${base}/content-lanes.json`, { items: [] }),
    workspaceLanes: await readJson(`${base}/workspace-lanes.json`, { items: [] }),
    rawCandidates: await readJson(`${base}/raw-candidates.json`, { items: [] })
  };
  return staticDataCache;
}
