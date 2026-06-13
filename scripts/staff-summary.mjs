import { loadStaffSummary } from "./lib/staff-system.mjs";

const args = parseArgs(process.argv.slice(2));
const summary = await loadStaffSummary({ userId: args.userId, workspaceId: args.workspaceId });

printStaffSummary(summary);

function parseArgs(argv) {
  const parsed = { userId: "", workspaceId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--user" || argv[index] === "--user-id") parsed.userId = argv[++index] || "";
    if (argv[index] === "--workspace" || argv[index] === "--workspace-id") parsed.workspaceId = argv[++index] || "";
  }
  return parsed;
}

function printStaffSummary(data) {
  const user = data.selectedUser;
  console.log(`Staff Summary - ${user?.name || "No active user"}`);
  console.log(`- Workspace ID: ${data.selectedWorkspace?.workspaceId || "none"}`);
  console.log(`- User ID: ${user?.userId || "none"}`);
  if (!data.accessAllowed) {
    console.log(`- Access: blocked (${data.accessError})`);
    return;
  }
  console.log(`- Assigned accounts: ${data.summary.accounts}`);
  console.log(`- Total tasks: ${data.summary.totalTasks}`);
  console.log(`- Ready to copy: ${data.summary.ready}`);
  console.log(`- Copied: ${data.summary.copied}`);
  console.log(`- Feedback due: ${data.summary.feedbackDue}`);
  console.log(`- Over 280 chars: ${data.summary.overLimit}`);
  console.log(`- Blocked/rejected: ${data.summary.blocked}`);

  console.log("\nAccounts:");
  if (!data.accounts.length) console.log("- none");
  for (const account of data.accounts.slice(0, 20)) {
    console.log(`- ${account.accountId}: ${account.persona || account.niche || "No persona"} (${account.status})`);
  }

  console.log("\nNext tasks:");
  const nextTasks = data.tasks.filter((task) => task.canCopy).slice(0, 10);
  if (!nextTasks.length) {
    console.log("- none ready");
    return;
  }
  for (const task of nextTasks) {
    console.log(`- ${task.accountId} | ${task.toolName} | ${task.tweetLength.weightedCharCount}/280 | ${task.status}`);
  }
}
