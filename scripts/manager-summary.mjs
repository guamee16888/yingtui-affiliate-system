import { loadManagerSummary } from "./lib/manager-system.mjs";

const args = parseArgs(process.argv.slice(2));
const summary = await loadManagerSummary({
  workspaceId: args.workspaceId,
  managerUserId: args.managerUserId
});

printManagerSummary(summary);

function parseArgs(argv) {
  const parsed = { workspaceId: "", managerUserId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--workspace" || argv[index] === "--workspace-id") parsed.workspaceId = argv[++index] || "";
    if (argv[index] === "--manager" || argv[index] === "--manager-user-id") parsed.managerUserId = argv[++index] || "";
  }
  return parsed;
}

function printManagerSummary(data) {
  const workspace = data.selectedWorkspace;
  const manager = data.selectedManager;
  console.log(`Manager Review - ${workspace?.name || "No workspace"}`);
  console.log(`- Workspace ID: ${workspace?.workspaceId || "none"}`);
  console.log(`- Manager: ${manager?.name || "none"} (${manager?.userId || "none"})`);
  if (!data.accessAllowed) {
    console.log(`- Access: blocked (${data.accessError})`);
    return;
  }
  console.log(`- Pending review: ${data.summary.pendingReview}`);
  console.log(`- Approved: ${data.summary.approved}`);
  console.log(`- Rejected: ${data.summary.rejected}`);
  console.log(`- Unassigned: ${data.summary.unassigned}`);
  console.log(`- Blocked/needs fix: ${data.summary.blocked}`);

  console.log("\nAccounts:");
  if (!data.accounts.length) console.log("- none");
  for (const account of data.accounts.slice(0, 20)) {
    console.log(`- ${account.accountId}: ${account.persona || account.niche || "No persona"} (${account.status})`);
  }

  console.log("\nNext review tasks:");
  const nextTasks = data.tasks
    .filter((task) => ["pending_review", "draft"].includes(task.status) || task.approvalStatus === "pending")
    .slice(0, 10);
  if (!nextTasks.length) {
    console.log("- none pending");
    return;
  }
  for (const task of nextTasks) {
    const status = task.canApprove ? "ready" : task.blockReasons[0] || "needs review";
    console.log(`- ${task.taskId} | ${task.toolName} | ${task.accountId || "no_account"} -> ${task.assignedTo || "no_staff"} | ${task.tweetLength.weightedCharCount}/280 | ${status}`);
  }
}
