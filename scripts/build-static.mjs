import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagerSummary } from "./lib/manager-system.mjs";
import { loadStaffSummary } from "./lib/staff-system.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const staticDeployment = {
  mode: "static_cloudflare",
  readOnly: true,
  note: "Cloudflare 静态演示模式：可以查看和复制，审核/发布/写入请回到本地 4174。"
};

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const dirname of ["dashboard", "staff", "manager", "data", "output", "public"]) {
  await cp(path.join(rootDir, dirname), path.join(distDir, dirname), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
      && !source.includes(`${path.sep}data${path.sep}backups`)
  });
}

await cp(path.join(rootDir, "public", "index.html"), path.join(distDir, "index.html"));

const managerSummary = {
  ...(await loadManagerSummary({ workspaceId: "workspace_default", managerUserId: "user_owner" })),
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
  ...(await loadStaffSummary({ workspaceId: "workspace_default", userId: "user_owner" })),
  deployment: staticDeployment
};
await writeStaticApi("/api/staff/summary", staffSummary);

console.log(`Built static AI Creator OS site in ${distDir}`);

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
