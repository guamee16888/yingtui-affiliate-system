import { CORE_COLLECTIONS, loadCollection } from "../lib/core-data.mjs";
import { normalizeDomain } from "../lib/url-utils.mjs";

const ledger = await loadCollection(CORE_COLLECTIONS.postLedger);
const sevenDaysAgo = Date.now() - 7 * 86400000;
const recent = ledger.items.filter((item) => new Date(item.postedAt || 0).getTime() >= sevenDaysAgo);
const duplicateHashes = countBy(ledger.items, "normalizedTextHash").filter(([, count]) => count > 1);

console.log("Post Ledger Summary");
console.log(`- Total published: ${ledger.items.length}`);
console.log(`- Last 7 days: ${recent.length}`);
console.log(`- Duplicate copy hashes: ${duplicateHashes.length}`);
console.log("\nTop tools:");
printCounts(countBy(recent, "toolId"));
console.log("\nWorkspaces:");
printCounts(countBy(recent, "workspaceId"));
console.log("\nTop domains:");
printCounts(countDomains(recent));
console.log("\nAffiliate links:");
printCounts(countBy(recent.filter((item) => item.affiliateLinkUsed), "affiliateLinkUsed"));
console.log("\nAccounts with many external links:");
printCounts(countAccountLinks(recent).filter(([, count]) => count > 1));

function countBy(items, field) {
  const counts = new Map();
  for (const item of items) {
    const key = item[field] || "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function countDomains(items) {
  const counts = new Map();
  for (const item of items) {
    const domain = normalizeDomain(item.externalLinks?.[0] || item.postedUrl || "");
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function countAccountLinks(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.accountId || "none", (counts.get(item.accountId || "none") ?? 0) + (item.externalLinks ?? []).length);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printCounts(counts) {
  if (!counts.length) {
    console.log("- none");
    return;
  }
  for (const [key, value] of counts.slice(0, 10)) {
    console.log(`- ${key}: ${value}`);
  }
}
