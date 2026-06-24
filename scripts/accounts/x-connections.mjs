import { loadXConnectionsSummary } from "../lib/publish-engine.mjs";

const summary = await loadXConnectionsSummary();
console.log("X Connections");
console.log(`- Accounts: ${summary.totalAccounts}`);
console.log(`- Connected: ${summary.connected}`);
console.log(`- Not connected: ${summary.notConnected}`);
console.log(`- Expired: ${summary.expired}`);
console.log(`- Revoked: ${summary.revoked}`);
console.log(`- Error: ${summary.error}`);
console.log(`- Auto publish accounts: ${summary.autoPublishAccounts}`);
console.log(`- Global auto publish: ${summary.globalAutoPublishEnabled ? "on" : "off"}`);
console.log(`- Dry-run by default: ${summary.dryRunByDefault ? "yes" : "no"}`);
console.log("\nAccounts:");
for (const item of summary.accounts.slice(0, 30)) {
  console.log(`- ${item.account.accountId}: ${item.connection.status} · ${item.account.publishMode}`);
}
