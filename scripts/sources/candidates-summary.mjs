import { formatCandidateSummary, loadCandidateSummary } from "../lib/source-lanes.mjs";

console.log(formatCandidateSummary(await loadCandidateSummary()));
