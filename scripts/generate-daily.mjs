import {
  buildDailyModel,
  candidateInboxToTools,
  fetchFeedWithFallback,
  loadAffiliateConfig,
  loadHistory,
  loadVoice,
  mergeToolSources,
  parseArgs,
  parseProductHuntFeed,
  saveHistory,
  updateHistory,
  writeDailyJsonOutputs,
  writeDailyOutput
} from "./lib/affiliate-system.mjs";
import { loadCandidateInbox } from "./lib/data-store.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];
  const [voice, affiliateConfig, history, feed, candidateInbox] = await Promise.all([
    loadVoice(warnings),
    loadAffiliateConfig(warnings),
    loadHistory(warnings),
    fetchFeedWithFallback(args.feed, warnings),
    loadCandidateInbox()
  ]);
  const productHuntTools = parseProductHuntFeed(feed.xml);
  const inboxTools = candidateInboxToTools(candidateInbox, args.date);
  const tools = mergeToolSources(productHuntTools, inboxTools);

  if (!tools.length) {
    throw new Error("No tools were parsed from the feed, fallback sample, or candidate inbox. Check the inputs.");
  }

  const model = buildDailyModel({
    date: args.date,
    feedSource: feed.source,
    usedFallback: feed.usedFallback,
    tools,
    history,
    affiliateConfig,
    voice,
    limit: args.limit,
    warnings,
    sourceBreakdown: {
      productHuntTools: productHuntTools.length,
      candidateInboxTools: inboxTools.length,
      mergedTools: tools.length
    }
  });
  const outputFile = await writeDailyOutput(model);
  const jsonFiles = await writeDailyJsonOutputs(model);
  let historyMessage = "Skipped history update because fallback sample data was used";

  if (!feed.usedFallback) {
    const nextHistory = updateHistory(history, args.date, model.picked);
    await saveHistory(nextHistory);
    historyMessage = `Updated data/history.json with ${model.picked.length} tool records`;
  }

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
  console.log(`Wrote ${outputFile}`);
  console.log(`Wrote ${jsonFiles.dailyFile}`);
  console.log(`Wrote ${jsonFiles.latestFile}`);
  console.log(`Merged ${productHuntTools.length} Product Hunt tools and ${inboxTools.length} candidate inbox tools`);
  console.log(historyMessage);
}

main().catch((error) => {
  console.error(`Daily generation failed: ${error.message}`);
  process.exitCode = 1;
});
