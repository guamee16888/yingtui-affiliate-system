import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDesktopHealth } from "./desktop-health-check.mjs";
import { prepareDesktopRuntime } from "./desktop-dev.mjs";
import { repoRoot } from "../desktop/app-config.mjs";

export const DESKTOP_VISIBLE_FORBIDDEN_TERMS = [
  "演示账号",
  "导入演示账号",
  "演示",
  "正式",
  "类型",
  "账号状态",
  "授权状态",
  "时区",
  "地区/时区",
  "timezone",
  "America/New_York",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
  "Desktop Demo",
  "Workspace Manager",
  "Workspace 管理端",
  "pending_review",
  "shortPost",
  "risk low",
  "下一版接入"
];

export function findForbiddenVisibleTerms(sections, forbiddenTerms = DESKTOP_VISIBLE_FORBIDDEN_TERMS) {
  const findings = [];
  for (const section of sections) {
    const text = String(section.text || "");
    for (const term of forbiddenTerms) {
      const index = text.indexOf(term);
      if (index !== -1) {
        findings.push({
          section: section.name || "page",
          term,
          snippet: snippetAround(text, index, term.length)
        });
      }
    }
  }
  return findings;
}

function snippetAround(text, index, length) {
  return text
    .slice(Math.max(0, index - 80), Math.min(text.length, index + length + 80))
    .replace(/\s+/g, " ")
    .trim();
}

async function runNodeAudit() {
  let backendServer = null;
  try {
    const runtime = await prepareDesktopRuntime({
      onPortBusy: (port) => console.log(`Port ${port} is in use, trying ${port + 1}...`)
    });

    process.env.APP_STORAGE_MODE = "json";
    process.env.AI_CREATOR_OS_DESKTOP = "1";
    process.env.AI_CREATOR_OS_DESKTOP_PORT = String(runtime.port);
    process.env.AI_CREATOR_OS_DATA_DIR = runtime.appDataDir;

    const { startDashboardServer } = await import("./serve-dashboard.mjs");
    backendServer = startDashboardServer({ host: runtime.host, port: runtime.port, silent: true });
    await checkDesktopHealth({ baseUrl: runtime.baseUrl, timeoutMs: 10_000 });

    const worker = await runElectronWorker({
      electronBin: runtime.electronBin,
      managerUrl: runtime.managerUrl,
      appDataDir: runtime.appDataDir,
      port: runtime.port
    });
    const sections = JSON.parse(worker.stdout);
    const findings = findForbiddenVisibleTerms(sections);
    if (findings.length) {
      console.error("Desktop visible text audit failed.");
      for (const finding of findings) {
        console.error(`- [${finding.section}] ${finding.term}: ${finding.snippet}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log("Desktop visible text audit passed.");
    console.log(`URL: ${runtime.managerUrl}`);
    console.log(`Sections checked: ${sections.map((section) => section.name).join(", ")}`);
  } finally {
    await closeBackend(backendServer);
  }
}

function runElectronWorker({ electronBin, managerUrl, appDataDir, port }) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(electronBin, [fileURLToPath(import.meta.url), "--electron-worker", managerUrl], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        APP_STORAGE_MODE: "json",
        AI_CREATOR_OS_DESKTOP: "1",
        AI_CREATOR_OS_DESKTOP_PORT: String(port),
        AI_CREATOR_OS_DATA_DIR: appDataDir,
        AI_CREATOR_OS_DESKTOP_URL: managerUrl
      }
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Electron visible text worker exited with ${code}: ${stderr || stdout}`));
    });
  });
}

async function closeBackend(server) {
  if (!server?.close) return;
  await new Promise((resolve) => server.close(() => resolve()));
}

async function runElectronWorkerMode() {
  const { app, BrowserWindow } = await import("electron");
  const managerUrl = process.argv[process.argv.indexOf("--electron-worker") + 1];
  if (!managerUrl) throw new Error("Missing manager URL.");
  await app.whenReady();
  const win = new BrowserWindow({
    show: false,
    width: 1320,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await win.loadURL(managerUrl);
  const sections = await win.webContents.executeJavaScript(`(${collectVisibleSections.toString()})()`);
  process.stdout.write(JSON.stringify(sections));
  win.destroy();
  app.quit();
}

async function collectVisibleSections() {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const collectDomMeta = () => ({
    inlineLaneSelects: document.querySelectorAll("select[data-account-inline-field=\"laneId\"]").length,
    inlineCountryInputs: document.querySelectorAll("input[data-account-inline-field=\"country\"]").length,
    topLaneFilters: Array.from(document.querySelectorAll(".desktop-filter-bar select[data-account-filter=\"lane\"]")).length,
    topCountryFilters: Array.from(document.querySelectorAll(".desktop-filter-bar select[data-account-filter=\"region\"]")).length
  });
  const waitUntilReady = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const text = document.body?.innerText || "";
      const accountInlineControlsReady = Boolean(document.querySelector("[data-account-inline-field=\"laneId\"], [data-account-inline-field=\"country\"]"));
      if ((text.includes("账号库") && accountInlineControlsReady) || text.includes("欢迎使用多账号 X 运营工具箱")) return;
      await delay(100);
    }
  };
  await waitUntilReady();

  const sections = [];
  const collect = (name) => {
    sections.push({
      name,
      text: document.body?.innerText || "",
      meta: collectDomMeta()
    });
  };

  collect("initial");
  const tabs = Array.from(document.querySelectorAll("[data-desktop-tab]"))
    .map((button) => ({ id: button.getAttribute("data-desktop-tab"), label: button.innerText.trim() }))
    .filter((tab) => tab.id);
  for (const tab of tabs) {
    const button = document.querySelector(`[data-desktop-tab="${CSS.escape(tab.id)}"]`);
    if (!button) continue;
    button.click();
    await delay(150);
    collect(tab.label || tab.id);
  }
  return sections;
}

if (process.argv.includes("--electron-worker")) {
  runElectronWorkerMode().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
} else if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runNodeAudit().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
