import { runOpenClawSourceHunter } from "./lib/openclaw-source-hunter.mjs";

const args = parseArgs(process.argv.slice(2));
const stats = await runOpenClawSourceHunter(args);

console.log("# OpenClaw Source Hunter\n");
console.log(`- Mode: ${stats.dryRun ? "dry-run" : "write"}`);
console.log(`- Fetched: ${stats.fetched}`);
console.log(`- Imported to raw-candidates: ${stats.imported}`);
console.log(`- Rejected by filter/score: ${stats.rejected}`);
console.log(`- Duplicates skipped: ${stats.duplicates}`);
console.log(`- Source run: ${stats.sourceRunId}`);
console.log(`- Total raw candidates: ${stats.totalRawCandidates}`);
console.log(`- Daily target status: ${stats.dailyTargetStatus}`);
if (stats.llm) {
  const reason = stats.llm.reason ? ` (${stats.llm.reason})` : "";
  console.log(`- LLM: ${stats.llm.mode} · ${stats.llm.provider}/${stats.llm.model}${reason}`);
  console.log(`- LLM judged: ${stats.llm.judged}, accepted: ${stats.llm.accepted}, rejected: ${stats.llm.rejected}, errors: ${stats.llm.errors}`);
}

if (stats.report?.sources?.length) {
  console.log("\n## Source Breakdown\n");
  for (const source of stats.report.sources) {
    const error = source.error ? ` · error: ${source.error}` : "";
    console.log(`- ${source.name}: fetched ${source.fetched}, imported ${source.imported}, rejected ${source.rejected}, duplicates ${source.duplicates}${error}`);
  }
}

if (stats.report?.topCandidates?.length) {
  console.log("\n## Top Candidates\n");
  for (const item of stats.report.topCandidates.slice(0, 12)) {
    console.log(`- ${item.score} · ${item.title} · ${item.url}`);
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    hunterIds: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--limit") args.limit = Number(argv[++index] || 0);
    else if (arg === "--min-score") args.minimumScore = Number(argv[++index] || 0);
    else if (arg === "--hunter") args.hunterIds.push(argv[++index]);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index] || 0);
    else if (arg === "--no-llm") args.noLlm = true;
    else if (arg === "--require-llm") args.requireLlm = true;
    else if (arg === "--strict-llm") args.strictLlm = true;
  }
  return args;
}
