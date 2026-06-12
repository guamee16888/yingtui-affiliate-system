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
import { loadAccountPosts, loadCandidateInbox, loadFeedback, loadQueues } from "./lib/data-store.mjs";
import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import {
  loadContentSourceConfig,
  refreshSourceCandidates,
  sourceCandidatesToTools
} from "./lib/content-source-system.mjs";
import { buildScaleReadiness, renderScaleReadinessMarkdown } from "./lib/scale-readiness.mjs";
import { buildAccountContentMatrix, renderAccountContentMatrixMarkdown } from "./lib/account-content-matrix.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];
  const [voice, affiliateConfig, accountConfig, history, feed, candidateInbox, contentSourceConfig, feedback, accountPosts, queues] = await Promise.all([
    loadVoice(warnings),
    loadAffiliateConfig(warnings),
    loadAccountConfig(warnings),
    loadHistory(warnings),
    fetchFeedWithFallback(args.feed, warnings),
    loadCandidateInbox(),
    loadContentSourceConfig(warnings),
    loadFeedback(),
    loadAccountPosts(),
    loadQueues()
  ]);
  const sourceRefresh = await refreshSourceCandidates(contentSourceConfig, warnings);
  const productHuntTools = parseProductHuntFeed(feed.xml);
  const inboxTools = candidateInboxToTools(candidateInbox, args.date);
  const sourceTools = sourceCandidatesToTools(sourceRefresh.sourceCandidates, args.date, contentSourceConfig);
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
    sourceCandidates: sourceRefresh.sourceCandidates,
    feedback,
    accountPosts,
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
  const matrixFiles = await writeAccountMatrixOutputs({ model, accountConfig });
  const scaleFiles = await writeScaleOutputs({ model, accountConfig, accountContentMatrix: matrixFiles.matrix });
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
  console.log(`Wrote ${scaleFiles.jsonPath}`);
  console.log(`Wrote ${scaleFiles.markdownPath}`);
  console.log(`Wrote ${matrixFiles.jsonPath}`);
  console.log(`Wrote ${matrixFiles.markdownPath}`);
  console.log(`Merged ${productHuntTools.length} Product Hunt tools, ${inboxTools.length} candidate inbox tools, and ${sourceTools.length} source candidate tools`);
  console.log(`Source refresh fetched ${sourceRefresh.fetchedCount} new items from ${sourceRefresh.enabledSources} enabled extra sources`);
  console.log(historyMessage);
}

async function writeScaleOutputs({ model, accountConfig, accountContentMatrix = null }) {
  const [contentCalendar, sourceImportPack] = await Promise.all([
    readJson("data/content-calendar/latest.json", model.contentCalendar ?? null),
    readJson("data/source-import-pack/latest.json", null)
  ]);
  const report = buildScaleReadiness({
    date: model.date,
    latest: model,
    feedbackOps: model.feedbackOps,
    accountConfig,
    contentCalendar,
    sourceImportPack,
    accountContentMatrix
  });
  const jsonPath = "data/scale-readiness.json";
  const markdownPath = `output/${model.date}-scale-readiness.md`;
  await writeJsonAtomic(jsonPath, report);
  await writeTextAtomic(markdownPath, renderScaleReadinessMarkdown(report));
  return { jsonPath, markdownPath };
}

async function writeAccountMatrixOutputs({ model, accountConfig }) {
  const matrix = buildAccountContentMatrix({
    date: model.date,
    latest: model,
    accountConfig,
    draftPlan: model.draftPlan,
    contentCalendar: model.contentCalendar,
    feedbackOps: model.feedbackOps
  });
  const jsonPath = "data/account-content-matrix.json";
  const markdownPath = `output/${model.date}-account-content-matrix.md`;
  await writeJsonAtomic(jsonPath, matrix);
  await writeTextAtomic(markdownPath, renderAccountContentMatrixMarkdown(matrix));
  return { jsonPath, markdownPath, matrix };
}

main().catch((error) => {
  console.error(`Daily generation failed: ${error.message}`);
  process.exitCode = 1;
});
