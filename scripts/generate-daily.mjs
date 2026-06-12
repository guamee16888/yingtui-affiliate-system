import {
  buildDailyModel,
  candidateInboxToTools,
  fetchFeedWithFallback,
  loadAccountConfig,
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
import { loadCandidateInbox, loadFeedback, loadQueues } from "./lib/data-store.mjs";
import {
  loadContentSourceConfig,
  refreshSourceCandidates,
  sourceCandidatesToTools
} from "./lib/content-source-system.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];
  const [voice, affiliateConfig, accountConfig, history, feed, candidateInbox, contentSourceConfig, feedback, queues] = await Promise.all([
    loadVoice(warnings),
    loadAffiliateConfig(warnings),
    loadAccountConfig(warnings),
    loadHistory(warnings),
    fetchFeedWithFallback(args.feed, warnings),
    loadCandidateInbox(),
    loadContentSourceConfig(warnings),
    loadFeedback(),
    loadQueues()
  ]);
  const sourceRefresh = await refreshSourceCandidates(contentSourceConfig, warnings);
  const productHuntTools = parseProductHuntFeed(feed.xml);
  const inboxTools = candidateInboxToTools(candidateInbox, args.date);
  const sourceTools = sourceCandidatesToTools(sourceRefresh.sourceCandidates, args.date);
  const tools = mergeToolSources(productHuntTools, [...inboxTools, ...sourceTools]);

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
    accountConfig,
    contentSourceConfig,
    feedback,
    queues,
    voice,
    limit: args.limit,
    warnings,
    sourceBreakdown: {
      productHuntTools: productHuntTools.length,
      candidateInboxTools: inboxTools.length,
      sourceCandidateTools: sourceTools.length,
      sourceFetchedTools: sourceRefresh.fetchedCount,
      enabledExtraSources: sourceRefresh.enabledSources,
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
  console.log(`Merged ${productHuntTools.length} Product Hunt tools, ${inboxTools.length} candidate inbox tools, and ${sourceTools.length} source candidate tools`);
  console.log(`Source refresh fetched ${sourceRefresh.fetchedCount} new items from ${sourceRefresh.enabledSources} enabled extra sources`);
  console.log(historyMessage);
}

main().catch((error) => {
  console.error(`Daily generation failed: ${error.message}`);
  process.exitCode = 1;
});
