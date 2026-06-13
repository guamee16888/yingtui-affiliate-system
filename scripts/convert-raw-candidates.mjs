import { convertRawCandidatesToCore } from "./lib/raw-candidate-converter.mjs";

const args = parseArgs(process.argv.slice(2));
const stats = await convertRawCandidatesToCore(args);

console.log("Raw candidate conversion complete");
console.log(`- Workspace: ${stats.workspaceId}`);
console.log(`- Scanned: ${stats.scanned}`);
console.log(`- Eligible: ${stats.eligible}`);
console.log(`- Tools added: ${stats.toolsAdded}`);
console.log(`- Tools updated: ${stats.toolsUpdated}`);
console.log(`- Topics added: ${stats.topicsAdded}`);
console.log(`- Copies added: ${stats.copiesAdded}`);
console.log(`- Tasks added: ${stats.tasksAdded}`);
console.log(`- Skipped no workspace lane: ${stats.skippedNoWorkspaceLane}`);
console.log(`- Skipped risk: ${stats.skippedRisk}`);
console.log(`- Skipped placeholder: ${stats.skippedPlaceholder}`);
console.log(`- Skipped existing task: ${stats.skippedExistingTask}`);
console.log(`- Blocked tasks: ${stats.blockedTasks}`);
console.log(`- Warning tasks: ${stats.warningTasks}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--workspace" || argv[index] === "--workspace-id") parsed.workspaceId = argv[++index] || "";
    else if (argv[index] === "--date") parsed.date = argv[++index] || "";
  }
  return parsed;
}
