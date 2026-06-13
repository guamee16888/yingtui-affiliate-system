import { dryRunPublishJobs } from "./lib/publish-engine.mjs";

const summary = await dryRunPublishJobs();
console.log("Publish Dry Run");
console.log(`- Jobs: ${summary.totalJobs}`);
console.log(`- Ready: ${summary.ready}`);
console.log(`- Blocked: ${summary.blocked}`);
console.log(`- Waiting approval: ${summary.waitingApproval}`);
console.log(`- Failed: ${summary.failed}`);
console.log("\nBlock reasons:");
if (!summary.blockReasons.length) console.log("- none");
for (const item of summary.blockReasons.slice(0, 10)) {
  console.log(`- ${item.reason}: ${item.count}`);
}
