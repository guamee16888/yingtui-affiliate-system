import { convertRawCandidatesToCore } from "./lib/raw-candidate-converter.mjs";
import { readJson } from "./lib/file-store.mjs";
import { runOpenClawSourceHunter, writeOpenClawReportMarkdown } from "./lib/openclaw-source-hunter.mjs";

const args = parseArgs(process.argv.slice(2));
const today = args.date || localDateString(new Date());
if (!args.dryRun && !args.force) {
  const previous = await latestOpenClawReport();
  const previousDate = previous?.generatedAt ? localDateString(new Date(previous.generatedAt)) : "";
  if (previousDate === today) {
    console.log("# OpenClaw Daily\n");
    console.log("- Mode: skipped");
    console.log(`- Reason: already ran today (${today})`);
    console.log(`- Previous imported raw candidates: ${previous.summary?.imported ?? 0}`);
    console.log(`- Previous daily target status: ${previous.summary?.dailyTargetStatus ?? "unknown"}`);
    console.log(`- Previous LLM: ${previous.summary?.llm?.mode ?? "unknown"} · ${previous.summary?.llm?.provider ?? ""}/${previous.summary?.llm?.model ?? ""}`);
    process.exit(0);
  }
}

const stats = await runOpenClawSourceHunter({
  dryRun: args.dryRun,
  limit: args.limit,
  minimumScore: args.minimumScore,
  hunterIds: args.hunterIds,
  timeoutMs: args.timeoutMs,
  requireLlm: !args.noLlm,
  strictLlm: !args.allowLlmFallback,
  noLlm: args.noLlm
});

let conversionStats = null;
let reportFile = null;
if (!args.dryRun) {
  reportFile = await writeOpenClawReportMarkdown(stats.report);
  if (!args.noConvert) {
    conversionStats = await convertRawCandidatesToCore({
      workspaceId: args.workspaceId,
      date: args.date
    });
  }
}

console.log("# OpenClaw Daily\n");
console.log(`- Mode: ${args.dryRun ? "dry-run" : "write"}`);
console.log(`- Imported raw candidates: ${stats.imported}`);
console.log(`- Daily target status: ${stats.dailyTargetStatus}`);
console.log(`- LLM: ${stats.llm?.mode} · ${stats.llm?.provider}/${stats.llm?.model}`);
console.log(`- LLM judged / accepted / rejected / errors: ${stats.llm?.judged ?? 0} / ${stats.llm?.accepted ?? 0} / ${stats.llm?.rejected ?? 0} / ${stats.llm?.errors ?? 0}`);
if (conversionStats) {
  console.log(`- Converted to topics/tasks: topics ${conversionStats.topicsAdded}, copy ${conversionStats.copiesAdded}, tasks ${conversionStats.tasksAdded}`);
}
if (reportFile) console.log(`- Report: ${reportFile.markdownPath}`);

if (args.failOnShort && stats.dailyTargetStatus !== "covered") process.exitCode = 2;

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    noConvert: false,
    noLlm: false,
    allowLlmFallback: false,
    failOnShort: false,
    force: false,
    hunterIds: [],
    workspaceId: "workspace_default"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--no-convert") parsed.noConvert = true;
    else if (arg === "--no-llm") parsed.noLlm = true;
    else if (arg === "--allow-llm-fallback") parsed.allowLlmFallback = true;
    else if (arg === "--fail-on-short") parsed.failOnShort = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--limit") parsed.limit = Number(argv[++index] || 0);
    else if (arg === "--min-score") parsed.minimumScore = Number(argv[++index] || 0);
    else if (arg === "--hunter") parsed.hunterIds.push(argv[++index]);
    else if (arg === "--timeout-ms") parsed.timeoutMs = Number(argv[++index] || 0);
    else if (arg === "--workspace" || arg === "--workspace-id") parsed.workspaceId = argv[++index] || parsed.workspaceId;
    else if (arg === "--date") parsed.date = argv[++index] || "";
  }
  return parsed;
}

async function latestOpenClawReport() {
  return readJson("data/openclaw-source-hunter-latest.json", null);
}

function localDateString(date, timeZone = process.env.OPENCLAW_TIME_ZONE || "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
