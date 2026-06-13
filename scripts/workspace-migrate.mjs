import { migrateWorkspaceData } from "./lib/workspace-system.mjs";

const stats = await migrateWorkspaceData();

console.log("Workspace migration complete");
console.log(`- Workspaces: ${stats.workspaces}`);
console.log(`- Users updated: ${stats.usersUpdated}`);
console.log(`- Accounts updated: ${stats.accountsUpdated}`);
console.log(`- Assignments updated: ${stats.assignmentsUpdated}`);
console.log(`- Tasks updated: ${stats.tasksUpdated}`);
console.log(`- Ledger updated: ${stats.ledgerUpdated}`);
console.log(`- Publish jobs updated: ${stats.publishJobsUpdated}`);
console.log(`- Publish attempts updated: ${stats.publishAttemptsUpdated}`);
console.log(`- X connections updated: ${stats.xConnectionsUpdated}`);
console.log(`- Feedback updated: ${stats.feedbackUpdated}`);
console.log(`- Manager links added: ${stats.managerUserIdsAdded}`);
console.log(`- Staff links added: ${stats.staffUserIdsAdded}`);
