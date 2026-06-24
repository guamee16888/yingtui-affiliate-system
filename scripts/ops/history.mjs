import {
  loadHistory,
  renderHistorySummary
} from "../lib/affiliate-system.mjs";

async function main() {
  const warnings = [];
  const history = await loadHistory(warnings);

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
  console.log(renderHistorySummary(history));
}

main().catch((error) => {
  console.error(`History command failed: ${error.message}`);
  process.exitCode = 1;
});
