import { runPublishJobs } from "../lib/publish-engine.mjs";

const args = parseArgs(process.argv.slice(2));
const summary = await runPublishJobs({
  live: args.live,
  actorRole: args.role
});

console.log(args.live ? "Publish Run - LIVE" : "Publish Run - dry-run");
console.log(`- Jobs: ${summary.totalJobs}`);
console.log(`- Ready: ${summary.ready}`);
console.log(`- Posted: ${summary.posted}`);
console.log(`- Failed: ${summary.failed}`);
console.log(`- Blocked: ${summary.blocked}`);
console.log(`- Attempts added: ${summary.attemptsAdded ?? 0}`);

function parseArgs(argv) {
  const parsed = { live: false, role: "admin" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--live") parsed.live = true;
    if (argv[index] === "--role") parsed.role = argv[++index] || "staff";
  }
  return parsed;
}
