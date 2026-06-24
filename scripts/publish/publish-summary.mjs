import { loadPublishSummary } from "../lib/publish-engine.mjs";

const args = parseArgs(process.argv.slice(2));
const summary = await loadPublishSummary({ workspaceId: args.workspaceId });
console.log("Publish Summary");
if (summary.workspaceId) console.log(`- Workspace: ${summary.workspaceId}`);
console.log(`- Jobs: ${summary.totalJobs}`);
console.log(`- Queued: ${summary.queued}`);
console.log(`- Ready: ${summary.ready}`);
console.log(`- Posted: ${summary.posted}`);
console.log(`- Failed: ${summary.failed}`);
console.log(`- Blocked: ${summary.blocked}`);
console.log(`- Waiting approval: ${summary.waitingApproval}`);
console.log(`- Global auto publish: ${summary.settings.globalAutoPublishEnabled ? "on" : "off"}`);
console.log(`- Dry-run by default: ${summary.settings.dryRunByDefault ? "yes" : "no"}`);
console.log(`- Connected accounts: ${summary.connections.connected}/${summary.connections.totalAccounts}`);
console.log("\nBlock reasons:");
if (!summary.blockReasons.length) console.log("- none");
for (const item of summary.blockReasons.slice(0, 10)) {
  console.log(`- ${item.reason}: ${item.count}`);
}

function parseArgs(argv) {
  const parsed = { workspaceId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--workspace" || argv[index] === "--workspace-id") parsed.workspaceId = argv[++index] || "";
  }
  return parsed;
}
