import { seedSourceLanes } from "./lib/source-lanes.mjs";

const stats = await seedSourceLanes();

console.log("Source Lane seed complete");
console.log(`- Content lanes: ${stats.lanes}`);
console.log(`- Workspaces: ${stats.workspaces}`);
console.log(`- Source connectors: ${stats.connectors}`);
console.log(`- Source feeds: ${stats.feeds}`);
console.log(`- Workspace lane subscriptions: ${stats.workspaceLanes}`);
console.log(`- Manual candidate templates: ${stats.manualCandidates}`);
console.log(`- Removed placeholder raw candidates: ${stats.removedPlaceholderRawCandidates}`);
