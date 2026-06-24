import { formatLaneSummary, loadLaneSummary } from "../lib/source-lanes.mjs";

const summary = await loadLaneSummary();

console.log(formatLaneSummary(summary));

if (summary.connectorsWithoutLane.length) {
  console.log("\nConnectors without lane:");
  for (const connectorId of summary.connectorsWithoutLane) console.log(`- ${connectorId}`);
}

if (summary.candidatesWithoutLane.length) {
  console.log("\nCandidates without lane:");
  for (const candidateId of summary.candidatesWithoutLane.slice(0, 20)) console.log(`- ${candidateId}`);
}
