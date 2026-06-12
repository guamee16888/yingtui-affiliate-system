import {
  loadAffiliateConfig,
  loadHistory,
  renderAffiliateQueueFromHistory
} from "./lib/affiliate-system.mjs";

async function main() {
  const warnings = [];
  const [history, affiliateConfig] = await Promise.all([
    loadHistory(warnings),
    loadAffiliateConfig(warnings)
  ]);

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
  console.log(renderAffiliateQueueFromHistory(history, affiliateConfig));
}

main().catch((error) => {
  console.error(`Affiliate queue command failed: ${error.message}`);
  process.exitCode = 1;
});
