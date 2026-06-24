import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../file-store.mjs";
import { loadLatest } from "../storage/interface.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

let dailyRunPromise = null;
let calendarRunPromise = null;
let sourcePackRunPromise = null;
let refillWorkbenchRunPromise = null;
let affiliateWorkbenchRunPromise = null;
let learningLoopRunPromise = null;

export async function runDailyGeneration() {
  if (dailyRunPromise) throw new Error("Daily refresh is already running. Wait for it to finish.");
  dailyRunPromise = runNodeScript("scripts/ops/generate-daily.mjs", "Daily refresh")
    .finally(() => {
      dailyRunPromise = null;
    });
  const result = await dailyRunPromise;
  const latest = await loadLatest();
  return {
    ...result,
    latestDate: latest?.date ?? null,
    generatedAt: latest?.generatedAt ?? null,
    usedFallback: Boolean(latest?.source?.usedFallback),
    topPicks: latest?.summary?.topPicks ?? 0
  };
}

export async function runContentCalendarGeneration() {
  if (calendarRunPromise) throw new Error("Content calendar refresh is already running. Wait for it to finish.");
  calendarRunPromise = runNodeScript("scripts/ops/content-calendar.mjs", "Content calendar refresh")
    .finally(() => {
      calendarRunPromise = null;
    });
  const result = await calendarRunPromise;
  const latest = await loadLatest();
  const calendar = await readJson("data/content-calendar/latest.json", latest?.contentCalendar ?? null);
  return {
    ...result,
    date: calendar?.date ?? latest?.date ?? null,
    scheduledPosts: calendar?.summary?.scheduledPosts ?? 0,
    targetPosts: calendar?.summary?.targetPosts ?? 0,
    draftGap: calendar?.summary?.draftGap ?? 0,
    capacityGap: calendar?.summary?.capacityGap ?? 0
  };
}

export async function runSourceImportPackGeneration() {
  if (sourcePackRunPromise) throw new Error("Source import pack is already running. Wait for it to finish.");
  sourcePackRunPromise = runNodeScript("scripts/sources/source-import-pack.mjs", "Source import pack")
    .finally(() => {
      sourcePackRunPromise = null;
    });
  const result = await sourcePackRunPromise;
  const pack = await readJson("data/source-import-pack/latest.json", null);
  return {
    ...result,
    date: pack?.date ?? null,
    totalRows: pack?.summary?.totalRows ?? 0,
    topCircle: pack?.summary?.topCircle ?? "",
    csvPath: pack?.summary?.csvPath ?? ""
  };
}

export async function runAccountRefillWorkbenchGeneration() {
  if (refillWorkbenchRunPromise) throw new Error("Account refill workbench is already running. Wait for it to finish.");
  refillWorkbenchRunPromise = runNodeScript("scripts/accounts/account-refill-workbench.mjs", "Account refill workbench")
    .finally(() => {
      refillWorkbenchRunPromise = null;
    });
  const result = await refillWorkbenchRunPromise;
  const workbench = await readJson("data/account-refill-workbench.json", null);
  return {
    ...result,
    date: workbench?.date ?? null,
    focusAccounts: workbench?.summary?.focusAccounts ?? 0,
    refillAccounts: workbench?.summary?.refillAccounts ?? 0,
    totalRefillNeed: workbench?.summary?.totalRefillNeed ?? 0
  };
}

export async function runAffiliateResearchWorkbenchGeneration() {
  if (affiliateWorkbenchRunPromise) throw new Error("Affiliate research workbench is already running. Wait for it to finish.");
  affiliateWorkbenchRunPromise = runNodeScript("scripts/ops/affiliate-research-summary.mjs", "Affiliate research workbench")
    .finally(() => {
      affiliateWorkbenchRunPromise = null;
    });
  const result = await affiliateWorkbenchRunPromise;
  const workbench = await readJson("data/affiliate-research-workbench.json", null);
  return {
    ...result,
    date: workbench?.date ?? null,
    candidates: workbench?.summary?.candidates ?? 0,
    readyToConfigure: workbench?.summary?.readyToConfigure ?? 0,
    researching: workbench?.summary?.researching ?? 0
  };
}

export async function runLearningLoopGeneration() {
  if (learningLoopRunPromise) throw new Error("Learning loop refresh is already running. Wait for it to finish.");
  learningLoopRunPromise = (async () => {
    await runNodeScript("scripts/ops/feedback-ops.mjs", "Feedback ops refresh");
    return runNodeScript("scripts/ops/learning-loop.mjs", "Learning loop refresh");
  })().finally(() => {
    learningLoopRunPromise = null;
  });
  const result = await learningLoopRunPromise;
  const loop = await readJson("data/learning-loop.json", null);
  return {
    ...result,
    date: loop?.date ?? null,
    status: loop?.status ?? "unknown",
    stage: loop?.stage ?? "unknown",
    posted: loop?.summary?.posted ?? 0,
    measured: loop?.summary?.measured ?? 0,
    pending: loop?.summary?.pending ?? 0,
    safeNewPosts: loop?.summary?.safeNewPosts ?? 0
  };
}

export async function runRoadmapGeneration() {
  const result = await runNodeScript("scripts/ops/roadmap.mjs", "Roadmap refresh");
  const roadmap = await readJson("data/product-roadmap.json", null);
  return {
    ...result,
    date: roadmap?.date ?? null,
    overallScore: roadmap?.overallScore ?? null,
    level: roadmap?.level ?? null,
    blockers: roadmap?.summary?.blockers ?? null
  };
}

function runNodeScript(relativeScriptPath, label = "Script") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, relativeScriptPath)], {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-12000);
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
      if (code === 0) resolve(result);
      else reject(new Error(`${label} failed (${code}): ${result.stderr || result.stdout || "no output"}`));
    });
  });
}
