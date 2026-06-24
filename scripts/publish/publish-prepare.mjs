import { preparePublishJobs } from "../lib/publish-engine.mjs";

const args = parseArgs(process.argv.slice(2));
const summary = await preparePublishJobs(args);
printSummary("Publish Prepare", summary);

function parseArgs(argv) {
  const parsed = { workspaceId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--workspace" || argv[index] === "--workspace-id") parsed.workspaceId = argv[++index] || "";
  }
  return parsed;
}

function printSummary(title, summary) {
  console.log(title);
  console.log(`- Jobs: ${summary.totalJobs}`);
  console.log(`- Created: ${summary.created ?? 0}`);
  console.log(`- Queued: ${summary.queued}`);
  console.log(`- Ready: ${summary.ready}`);
  console.log(`- Blocked: ${summary.blocked}`);
  console.log(`- Waiting approval: ${summary.waitingApproval}`);
}
