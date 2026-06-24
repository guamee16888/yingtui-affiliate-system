import { CORE_COLLECTIONS, loadCollection } from "../lib/core-data.mjs";
import { todayString } from "../lib/ids.mjs";

const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
const today = todayString();
const statusCounts = countBy(tasks.items, "status");
const byEmployee = countBy(tasks.items.filter((item) => item.assignedTo), "assignedTo");
const byAccount = countBy(tasks.items.filter((item) => item.accountId), "accountId");
const byWorkspace = countBy(tasks.items, "workspaceId");
const blockRisk = tasks.items.filter((item) => item.duplicateCheckResult?.riskLevel === "block").length;
const highRisk = tasks.items.filter((item) => item.duplicateCheckResult?.riskLevel === "high").length;

console.log(`Task Summary - ${today}`);
console.log(`- Total tasks: ${tasks.items.length}`);
console.log(`- Today's tasks: ${tasks.items.filter((item) => item.date === today).length}`);
console.log(`- Block risk: ${blockRisk}`);
console.log(`- High risk: ${highRisk}`);
console.log(`- Missing account: ${tasks.items.filter((item) => !item.accountId).length}`);
console.log(`- Missing employee: ${tasks.items.filter((item) => !item.assignedTo).length}`);
console.log("\nStatus counts:");
printCounts(statusCounts);
console.log("\nWorkspace counts:");
printCounts(byWorkspace);
console.log("\nEmployee counts:");
printCounts(byEmployee);
console.log("\nAccount counts:");
printCounts(byAccount);

function countBy(items, field) {
  const counts = new Map();
  for (const item of items) {
    const key = item[field] || "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printCounts(counts) {
  if (!counts.length) {
    console.log("- none");
    return;
  }
  for (const [key, value] of counts.slice(0, 20)) {
    console.log(`- ${key}: ${value}`);
  }
}
