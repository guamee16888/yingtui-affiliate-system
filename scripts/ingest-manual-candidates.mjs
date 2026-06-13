import { ingestManualCandidates } from "./lib/source-lanes.mjs";

const stats = await ingestManualCandidates();

console.log("Manual candidate ingest complete");
console.log(`- Manual candidates: ${stats.manualCandidates}`);
console.log(`- Imported: ${stats.imported}`);
console.log(`- Skipped duplicates: ${stats.skippedDuplicates}`);
console.log(`- Warnings: ${stats.warnings}`);
console.log(`- Source run: ${stats.sourceRunId}`);
console.log(`- Total raw candidates: ${stats.totalRawCandidates}`);
console.log(`- Candidates without lane: ${stats.withoutLane}`);
console.log(`- Crypto risk flags: ${stats.cryptoRiskFlags}`);
