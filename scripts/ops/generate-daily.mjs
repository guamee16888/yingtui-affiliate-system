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
} from "../lib/affiliate-system.mjs";
import { loadAccountPosts, loadAffiliateResearch, loadCandidateInbox, loadFeedback, loadQueues } from "../lib/storage/interface.mjs";
import { readJson, readText, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import {
  buildSourceImportPack,
  loadContentSourceConfig,
  refreshSourceCandidates,
  sourceCandidatesToTools
} from "../lib/content-source-system.mjs";
import { buildScaleReadiness, renderScaleReadinessMarkdown } from "../lib/scale-readiness.mjs";
import { buildAccountContentMatrix, renderAccountContentMatrixMarkdown } from "../lib/account-content-matrix.mjs";
import { buildScaleRampPlan, renderScaleRampPlanMarkdown } from "../lib/scale-ramp-plan.mjs";
import { buildSeedBatchPack, renderSeedBatchPackMarkdown, seedBatchRowsToCsv } from "../lib/seed-batch-pack.mjs";
import { buildAccountRefillWorkbench, renderAccountRefillWorkbenchMarkdown } from "../lib/account-refill-workbench.mjs";
import { buildProductRoadmap, renderProductRoadmapMarkdown } from "../lib/product-roadmap.mjs";
import { buildContentOpsPlan, renderContentOpsPlanMarkdown } from "../lib/content-ops-plan.mjs";
import { buildAccountConflictRadar, renderAccountConflictRadarMarkdown } from "../lib/account-conflict-radar.mjs";
import { buildSupplyGapFiller, renderSupplyGapFillerMarkdown } from "../lib/supply-gap-filler.mjs";
import { buildSourceNetworkReports, renderSourceNetworkMarkdown, writeSourceNetworkReports } from "../lib/source-network.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];
  const [voice, affiliateConfig, accountConfig, history, feed, candidateInbox, contentSourceConfig, feedback, accountPosts, queues, affiliateResearch] = await Promise.all([
    loadVoice(warnings),
    loadAffiliateConfig(warnings),
    loadAccountConfig(warnings),
    loadHistory(warnings),
    fetchFeedWithFallback(args.feed, warnings),
    loadCandidateInbox(),
    loadContentSourceConfig(warnings),
    loadFeedback(),
    loadAccountPosts(),
    loadQueues(),
    loadAffiliateResearch()
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
  const refillFiles = await writeAccountRefillWorkbenchOutputs({ model, accountContentMatrix: matrixFiles.matrix });
  const scaleFiles = await writeScaleOutputs({ model, accountConfig, accountContentMatrix: matrixFiles.matrix });
  const rampFiles = await writeScaleRampOutputs({ model, accountContentMatrix: matrixFiles.matrix, scaleReadiness: scaleFiles.report });
  const seedPackFiles = await writeSeedBatchOutputs({ model, scaleRampPlan: rampFiles.plan });
  const opsPlanFiles = await writeContentOpsPlanOutputs({ model, scaleReadiness: scaleFiles.report, accountRefillWorkbench: refillFiles.workbench });
  const conflictFiles = await writeAccountConflictRadarOutputs({ model, accountConfig, accountPosts, feedback });
  const sourceNetworkFiles = await writeSourceNetworkOutputs({ date: model.date });
  const supplyGapFiles = await writeSupplyGapFillerOutputs({ model, accountRefillWorkbench: refillFiles.workbench, accountContentMatrix: matrixFiles.matrix, contentSourceConfig, sourceNetwork: sourceNetworkFiles.reports });
  const roadmapFiles = await writeProductRoadmapOutputs({ model, feedback, queues, affiliateResearch, accountPosts, affiliateConfig });
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
  console.log(`Wrote ${refillFiles.jsonPath}`);
  console.log(`Wrote ${refillFiles.markdownPath}`);
  console.log(`Wrote ${rampFiles.jsonPath}`);
  console.log(`Wrote ${rampFiles.markdownPath}`);
  console.log(`Wrote ${seedPackFiles.jsonPath}`);
  console.log(`Wrote ${seedPackFiles.csvPath}`);
  console.log(`Wrote ${seedPackFiles.markdownPath}`);
  console.log(`Wrote ${opsPlanFiles.jsonPath}`);
  console.log(`Wrote ${opsPlanFiles.markdownPath}`);
  console.log(`Wrote ${conflictFiles.jsonPath}`);
  console.log(`Wrote ${conflictFiles.markdownPath}`);
  console.log(`Wrote ${sourceNetworkFiles.markdownPath}`);
  console.log(`Wrote ${supplyGapFiles.jsonPath}`);
  console.log(`Wrote ${supplyGapFiles.markdownPath}`);
  console.log(`Wrote ${roadmapFiles.jsonPath}`);
  console.log(`Wrote ${roadmapFiles.markdownPath}`);
  console.log(`Merged ${productHuntTools.length} Product Hunt tools, ${inboxTools.length} candidate inbox tools, and ${sourceTools.length} source candidate tools`);
  console.log(`Source refresh fetched ${sourceRefresh.fetchedCount} new items from ${sourceRefresh.enabledSources} enabled extra sources`);
  console.log(historyMessage);
}

async function writeSourceNetworkOutputs({ date }) {
  const reports = await buildSourceNetworkReports({ date });
  await writeSourceNetworkReports(reports);
  return {
    reports,
    jsonPaths: ["data/source-registry.json", "data/source-quality.json", "data/source-supply.json"],
    markdownPath: `output/${date}-source-network.md`,
    markdown: renderSourceNetworkMarkdown(reports)
  };
}

async function writeAccountConflictRadarOutputs({ model, accountConfig, accountPosts, feedback }) {
  const radar = buildAccountConflictRadar({
    date: model.date,
    latest: model,
    accountPosts,
    feedback,
    accountConfig
  });
  const jsonPath = "data/account-conflict-radar.json";
  const markdownPath = `output/${model.date}-account-conflict-radar.md`;
  await writeJsonAtomic(jsonPath, radar);
  await writeTextAtomic(markdownPath, renderAccountConflictRadarMarkdown(radar));
  return { jsonPath, markdownPath, radar };
}

async function writeSupplyGapFillerOutputs({ model, accountRefillWorkbench, accountContentMatrix, contentSourceConfig, sourceNetwork = null }) {
  const savedSourceImportPack = await readJson("data/source-import-pack/latest.json", null);
  const sourceImportPack = savedSourceImportPack?.date === model.date
    ? savedSourceImportPack
    : buildSourceImportPack({
      date: model.date,
      sourceQualityQueue: model.sourceQualityQueue,
      contentSourceConfig,
      totalRows: 300,
      csvPath: `output/source-import-pack/${model.date}-source-import-template.csv`,
      guidePath: `output/source-import-pack/${model.date}-source-import-guide.md`
    });
  const plan = buildSupplyGapFiller({
    date: model.date,
    latest: model,
    sourceImportPack,
    accountRefillWorkbench,
    accountContentMatrix,
    contentSourceConfig,
    sourceNetwork
  });
  const jsonPath = "data/supply-gap-filler.json";
  const markdownPath = `output/${model.date}-supply-gap-filler.md`;
  await writeJsonAtomic(jsonPath, plan);
  await writeTextAtomic(markdownPath, renderSupplyGapFillerMarkdown(plan));
  return { jsonPath, markdownPath, plan };
}

async function writeContentOpsPlanOutputs({ model, scaleReadiness, accountRefillWorkbench }) {
  const sourceImportPack = await readJson("data/source-import-pack/latest.json", null);
  const plan = buildContentOpsPlan({
    date: model.date,
    latest: model,
    scaleReadiness,
    accountRefillWorkbench,
    sourceImportPack
  });
  const jsonPath = "data/content-ops-plan.json";
  const markdownPath = `output/${model.date}-content-ops-plan.md`;
  await writeJsonAtomic(jsonPath, plan);
  await writeTextAtomic(markdownPath, renderContentOpsPlanMarkdown(plan));
  return { jsonPath, markdownPath, plan };
}

async function writeProductRoadmapOutputs({ model, feedback, queues, affiliateResearch, accountPosts, affiliateConfig }) {
  const [contentCalendar, sourceImportPack, affiliateWorkbench, dashboardHtml, dashboardApp] = await Promise.all([
    readJson("data/content-calendar/latest.json", model.contentCalendar ?? null),
    readJson("data/source-import-pack/latest.json", null),
    readJson("data/affiliate-research-workbench.json", null),
    readText("dashboard/index.html", ""),
    readText("dashboard/js/app.js", "")
  ]);
  const roadmap = buildProductRoadmap({
    date: model.date,
    latest: model,
    feedback,
    queues,
    affiliateResearch,
    accountPosts,
    affiliateLinks: affiliateConfig,
    contentCalendar,
    sourceImportPack,
    affiliateWorkbench,
    publicDemoReady: dashboardHtml.includes("modeBanner") && dashboardApp.includes("公开只读 Demo")
  });
  const jsonPath = "data/product-roadmap.json";
  const markdownPath = `output/${model.date}-product-roadmap.md`;
  await writeJsonAtomic(jsonPath, { version: 1, ...roadmap });
  await writeTextAtomic(markdownPath, renderProductRoadmapMarkdown(roadmap));
  return { jsonPath, markdownPath, roadmap };
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
  return { jsonPath, markdownPath, report };
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

async function writeAccountRefillWorkbenchOutputs({ model, accountContentMatrix }) {
  const workbench = buildAccountRefillWorkbench({
    date: model.date,
    accountContentMatrix
  });
  const jsonPath = "data/account-refill-workbench.json";
  const markdownPath = `output/${model.date}-account-refill-workbench.md`;
  await writeJsonAtomic(jsonPath, workbench);
  await writeTextAtomic(markdownPath, renderAccountRefillWorkbenchMarkdown(workbench));
  return { jsonPath, markdownPath, workbench };
}

async function writeScaleRampOutputs({ model, accountContentMatrix, scaleReadiness }) {
  const plan = buildScaleRampPlan({
    date: model.date,
    accountContentMatrix,
    scaleReadiness
  });
  const jsonPath = "data/scale-ramp-plan.json";
  const markdownPath = `output/${model.date}-scale-ramp-plan.md`;
  await writeJsonAtomic(jsonPath, plan);
  await writeTextAtomic(markdownPath, renderScaleRampPlanMarkdown(plan));
  return { jsonPath, markdownPath, plan };
}

async function writeSeedBatchOutputs({ model, scaleRampPlan }) {
  const csvPath = `output/${model.date}-seed-batch-template.csv`;
  const markdownPath = `output/${model.date}-seed-batch-pack.md`;
  const jsonPath = "data/seed-batch-pack.json";
  const pack = buildSeedBatchPack({
    date: model.date,
    scaleRampPlan,
    csvPath,
    guidePath: markdownPath
  });
  await writeTextAtomic(csvPath, seedBatchRowsToCsv(pack.rows));
  await writeTextAtomic(markdownPath, renderSeedBatchPackMarkdown(pack));
  await writeJsonAtomic(jsonPath, pack);
  return { jsonPath, csvPath, markdownPath, pack };
}

main().catch((error) => {
  console.error(`Daily generation failed: ${error.message}`);
  process.exitCode = 1;
});
