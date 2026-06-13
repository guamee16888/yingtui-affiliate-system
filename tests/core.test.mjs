import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createToolId, slugify } from "../scripts/lib/ids.mjs";
import { calculateEngagement } from "../scripts/lib/scoring.mjs";
import { readJson, writeJsonAtomic } from "../scripts/lib/file-store.mjs";
import { buildAccountPost, buildCandidateItem, buildFeedbackEntry, buildQueueItem } from "../scripts/lib/data-store.mjs";
import { buildReviewOutline } from "../scripts/lib/review-outline.mjs";
import { mapFeedbackCsv, parseCsv } from "../scripts/lib/csv-feedback.mjs";
import { parseCandidatePaste } from "../scripts/lib/candidate-parser.mjs";
import { evaluateCandidateQualityGate } from "../scripts/lib/candidate-quality-gate.mjs";
import { buildDecisionReport } from "../scripts/lib/decision-engine.mjs";
import { buildPromotionReviewQueue, buildPromotionSuggestions } from "../scripts/lib/promotion-engine.mjs";
import { accountEnvPrefix, accountEnvUpdates, buildXPostPayload, getAccountXPublishStatus, getXPublishStatus, resolveXAccessToken, shouldRefreshXToken } from "../scripts/lib/x-publish.mjs";
import { mergeDotEnvText, parseDotEnv } from "../scripts/lib/env.mjs";
import { buildDailyModel, candidateInboxToTools, makeCopyVariants, mergeToolSources, scoreTool } from "../scripts/lib/affiliate-system.mjs";
import { buildAccountStrategy, recommendAccountForItem } from "../scripts/lib/account-system.mjs";
import { buildSourceDiscoveryPack, buildSourceHealth, buildSourceImportPack, buildSourceImportPackRows, buildSourceQualityQueue, buildSourceSupplyWorkbench, buildSupplyPlan, evaluateSourceCandidateQuality, renderSourceDiscoveryMarkdown, renderSourceSupplyWorkbenchMarkdown, sourceCandidatesToTools, sourceImportRowsToCsv } from "../scripts/lib/content-source-system.mjs";
import { buildDraftPlan } from "../scripts/lib/draft-planner.mjs";
import { buildContentCalendar } from "../scripts/lib/content-calendar.mjs";
import { buildProductRoadmap } from "../scripts/lib/product-roadmap.mjs";
import { buildFeedbackLearningSignals, buildFeedbackOps, buildFeedbackSeedTestPlan, buildLearningLoop, renderLearningLoopMarkdown } from "../scripts/lib/feedback-ops.mjs";
import { affiliateSearchLinks, buildAffiliateResearchWorkbench } from "../scripts/lib/affiliate-research-workbench.mjs";
import { affiliateLinkMatchesTool, realAffiliateLinks } from "../scripts/lib/affiliate-links.mjs";
import { buildScaleReadiness } from "../scripts/lib/scale-readiness.mjs";
import { accountRefillRowsToCsv, buildAccountContentMatrix, buildAccountRefillTemplate, renderAccountContentMatrixMarkdown } from "../scripts/lib/account-content-matrix.mjs";
import { buildAccountRefillWorkbench, renderAccountRefillWorkbenchMarkdown } from "../scripts/lib/account-refill-workbench.mjs";
import { buildAccountRefillImpact } from "../scripts/lib/account-refill-impact.mjs";
import { buildScaleRampPlan } from "../scripts/lib/scale-ramp-plan.mjs";
import { buildSeedBatchPack, buildSeedImportNextActions, buildSeedImportReadiness, seedBatchRowsToCsv } from "../scripts/lib/seed-batch-pack.mjs";
import { buildContentOpsPlan } from "../scripts/lib/content-ops-plan.mjs";
import { buildAccountConflictRadar } from "../scripts/lib/account-conflict-radar.mjs";
import { buildSupplyGapFiller, renderSupplyGapFillerMarkdown } from "../scripts/lib/supply-gap-filler.mjs";

function seedTool({ id, accountId, score = 25, published = "2026-06-12T00:00:00.000Z" }) {
  return {
    toolId: id,
    name: id.replace(/_/g, " "),
    url: `https://${id}.example.com`,
    published,
    sourceName: "Seed Source",
    score,
    seenBefore: false,
    followUpAction: "tweet only",
    scoreBreakdown: { affiliateScore: 4, contentScore: 7, riskScore: 2 },
    accountRecommendation: {
      primary: { accountId, displayName: accountId, score: 10 },
      alternatives: []
    },
    copyVariants: {
      shortPost: `${id} short post`,
      painPointHook: `${id} pain hook`,
      casualPost: `${id} casual post`,
      threadOpening: `${id} thread opening`
    }
  };
}

test("createToolId is stable", () => {
  const a = createToolId("Test Tool", "https://example.com/product");
  const b = createToolId("Test Tool", "https://example.com/product?utm=1");
  assert.equal(a, b);
});

test("slugify normalizes text", () => {
  assert.equal(slugify("Hello, AI Tool!"), "hello-ai-tool");
});

test("engagement score and rates are finite", () => {
  const result = calculateEngagement({ impressions: 200, likes: 2, bookmarks: 1, replies: 1, reposts: 1, clicks: 3, profileVisits: 4 });
  assert.equal(Number.isFinite(result.engagementScore), true);
  assert.equal(result.engagementRate > 0, true);
  assert.equal(calculateEngagement({ impressions: 0 }).clickRate, 0);
});

test("feedback entry can represent posted copy before metrics are recorded", () => {
  const entry = buildFeedbackEntry({
    toolName: "Tool",
    toolUrl: "https://tool.example.com",
    sourceDate: "2026-06-08",
    variantType: "shortPost",
    accountId: "ai_tools_lab",
    accountName: "AI Tools Lab",
    copyText: "Short copy",
    posted: true,
    metrics: {}
  });

  assert.equal(entry.posted, true);
  assert.equal(entry.accountId, "ai_tools_lab");
  assert.equal(entry.accountName, "AI Tools Lab");
  assert.equal(entry.metrics.impressions, 0);
  assert.equal(entry.engagementScore, 0);
});

test("account post preserves account and feedback linkage", () => {
  const post = buildAccountPost({
    feedbackId: "feedback_1",
    accountId: "ai_tools_lab",
    accountName: "AI Tools Lab",
    toolName: "Tool",
    toolUrl: "https://tool.com",
    copyText: "Short copy"
  });

  assert.equal(post.feedbackId, "feedback_1");
  assert.equal(post.accountId, "ai_tools_lab");
  assert.equal(post.status, "posted");
});

test("feedback ops reports pending metrics and account learning", () => {
  const measured = buildFeedbackEntry({
    toolId: "tool_1",
    toolName: "Tool 1",
    toolUrl: "https://tool1.example.com",
    variantType: "painPointHook",
    accountId: "ai_tools_lab",
    accountName: "AI Tools Lab",
    sourceName: "Product Hunt",
    sourceType: "producthunt",
    circle: "ai_startups",
    copyText: "Measured copy",
    posted: true,
    metrics: { impressions: 1000, likes: 20, bookmarks: 5, replies: 2, clicks: 7 }
  });
  const pending = buildFeedbackEntry({
    toolId: "tool_2",
    toolName: "Tool 2",
    toolUrl: "https://tool2.example.com",
    variantType: "shortPost",
    accountId: "saas_growth_ops",
    accountName: "SaaS Growth Ops",
    copyText: "Pending copy",
    posted: true,
    metrics: {}
  });
  const ops = buildFeedbackOps({
    date: "2026-06-12",
    latest: {
      tools: [
        { toolId: "tool_1", sourceName: "Product Hunt", sourceType: "producthunt", circle: "ai_startups" },
        { toolId: "tool_2", sourceName: "Manual", sourceType: "inbox", circle: "saas_founders" }
      ]
    },
    feedback: { entries: [measured, pending] },
    accountPosts: { items: [] },
    accountConfig: {
      accounts: [
        { id: "ai_tools_lab", displayName: "AI Tools Lab", active: true },
        { id: "saas_growth_ops", displayName: "SaaS Growth Ops", active: true }
      ]
    }
  });

  assert.equal(ops.summary.posted, 2);
  assert.equal(ops.summary.measured, 1);
  assert.equal(ops.summary.pending, 1);
  assert.equal(ops.debtGate.status, "controlled_test");
  assert.equal(ops.debtGate.maxNewPostsBeforeMetrics, 3);
  assert.equal(ops.pendingFeedback[0].toolName, "Tool 2");
  assert.equal(ops.accountStats.find((item) => item.accountId === "ai_tools_lab").measured, 1);
  assert.equal(ops.angleStats[0].variantType, "painPointHook");
  assert.equal(ops.sourceStats[0].sourceName, "Product Hunt");
  assert.equal(ops.learningSignals.topSources[0].sourceName, "Product Hunt");
  assert.equal(ops.learningSignals.pendingAlerts[0].toolName, "Tool 2");
  assert.equal(buildFeedbackLearningSignals(ops).status, "early_learning");
});

test("feedback debt gate blocks scale when posted rows have no metrics", () => {
  const pending = buildFeedbackEntry({
    toolId: "tool_pending",
    toolName: "Pending Tool",
    toolUrl: "https://pending.example.com",
    variantType: "shortPost",
    accountId: "ai_tools_lab",
    accountName: "AI Tools Lab",
    copyText: "Pending copy",
    posted: true,
    metrics: {}
  });
  const ops = buildFeedbackOps({
    date: "2026-06-12",
    latest: { tools: [{ toolId: "tool_pending", sourceName: "Manual" }] },
    feedback: { entries: [pending] },
    accountPosts: { items: [] },
    accountConfig: {
      accounts: [
        { id: "ai_tools_lab", displayName: "AI Tools Lab", active: true },
        { id: "saas_growth_ops", displayName: "SaaS Growth Ops", active: true }
      ]
    }
  });

  assert.equal(ops.debtGate.status, "blocked_no_metrics");
  assert.equal(ops.debtGate.maxNewPostsBeforeMetrics, 0);
  assert.equal(ops.actionList[0].type, "feedback_debt_gate");
  assert.equal(ops.learningSignals.status, "metrics_blocked");
  assert.match(ops.learningSignals.headline, /without metrics/);
});

test("feedback debt gate stops new posts when pending debt is high", () => {
  const measured = buildFeedbackEntry({
    toolId: "tool_measured",
    toolName: "Measured Tool",
    toolUrl: "https://measured.example.com",
    variantType: "painPointHook",
    accountId: "ai_tools_lab",
    accountName: "AI Tools Lab",
    copyText: "Measured copy",
    posted: true,
    metrics: { impressions: 800, likes: 10, bookmarks: 3, clicks: 4 }
  });
  const pending = Array.from({ length: 4 }, (_, index) => buildFeedbackEntry({
    toolId: `tool_pending_${index}`,
    toolName: `Pending Tool ${index}`,
    toolUrl: `https://pending-${index}.example.com`,
    variantType: "shortPost",
    accountId: index % 2 ? "ai_tools_lab" : "saas_growth_ops",
    accountName: index % 2 ? "AI Tools Lab" : "SaaS Growth Ops",
    copyText: `Pending copy ${index}`,
    posted: true,
    metrics: {}
  }));
  const entries = [measured, ...pending];
  const ops = buildFeedbackOps({
    date: "2026-06-12",
    latest: { tools: entries.map((entry) => ({ toolId: entry.toolId, sourceName: "Manual" })) },
    feedback: { entries },
    accountPosts: { items: [] },
    accountConfig: {
      accounts: [
        { id: "ai_tools_lab", displayName: "AI Tools Lab", active: true },
        { id: "saas_growth_ops", displayName: "SaaS Growth Ops", active: true }
      ]
    }
  });

  assert.equal(ops.debtGate.status, "feedback_debt_high");
  assert.equal(ops.debtGate.maxNewPostsBeforeMetrics, 0);
  assert.equal(ops.pendingFeedback.length, 4);
  assert.equal(ops.learningSignals.status, "clear_feedback_debt");
});

test("feedback seed plan picks a tiny fresh manual test batch", () => {
  const accountConfig = {
    accounts: [
      { id: "ai", displayName: "AI Tools", category: "ai", active: true },
      { id: "saas", displayName: "SaaS Notes", category: "saas", active: true },
      { id: "crypto", displayName: "Crypto Builders", category: "crypto", active: true }
    ]
  };
  const latest = {
    generatedAt: "2026-06-12T12:00:00.000Z",
    tools: [
      seedTool({ id: "tool_ai", accountId: "ai", score: 32, published: "2026-06-12T06:00:00.000Z" }),
      seedTool({ id: "tool_saas", accountId: "saas", score: 30, published: "2026-06-12T05:00:00.000Z" }),
      seedTool({ id: "tool_crypto", accountId: "crypto", score: 29, published: "2026-06-11T16:00:00.000Z" }),
      seedTool({ id: "tool_old", accountId: "ai", score: 50, published: "2026-06-09T00:00:00.000Z" })
    ]
  };
  const ops = buildFeedbackOps({
    date: "2026-06-12",
    latest,
    feedback: { entries: [] },
    accountPosts: { items: [] },
    accountConfig
  });

  assert.equal(ops.seedTestPlan.status, "ready");
  assert.equal(ops.seedTestPlan.items.length, 3);
  assert.deepEqual(ops.seedTestPlan.items.map((item) => item.accountId), ["ai", "saas", "crypto"]);
  assert.deepEqual(ops.seedTestPlan.items.map((item) => item.variantType), ["shortPost", "painPointHook", "casualPost"]);
  assert.equal(ops.seedTestPlan.items.some((item) => item.toolId === "tool_old"), false);
});

test("feedback seed plan stops when gate blocks new posts", () => {
  const plan = buildFeedbackSeedTestPlan({
    latest: { tools: [seedTool({ id: "tool_ai", accountId: "ai" })] },
    activeAccounts: [{ id: "ai", displayName: "AI Tools", active: true }],
    debtGate: { maxNewPostsBeforeMetrics: 0, headline: "Fill metrics first." }
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.items.length, 0);
  assert.match(plan.reason, /Fill metrics first/);
});

test("feedback seed plan only picks postable copy variants", () => {
  const longPost = "x".repeat(301);
  const plan = buildFeedbackSeedTestPlan({
    latest: {
      generatedAt: "2026-06-12T12:00:00.000Z",
      tools: [
        {
          ...seedTool({ id: "tool_ai", accountId: "ai", score: 30, published: "2026-06-12T06:00:00.000Z" }),
          copyVariants: {
            shortPost: longPost,
            painPointHook: "Short enough to post."
          }
        }
      ]
    },
    activeAccounts: [{ id: "ai", displayName: "AI Tools", active: true }],
    debtGate: { maxNewPostsBeforeMetrics: 3 }
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.items[0].variantType, "painPointHook");
  assert.equal(plan.items[0].copyText.length < 280, true);
});

test("learning loop starts with seed batch when no posts exist", () => {
  const ops = {
    date: "2026-06-12",
    summary: {
      posted: 0,
      measured: 0,
      pending: 0,
      learningScore: 0,
      activeAccounts: 20,
      measuredAccounts: 0,
      maxNewPostsBeforeMetrics: 3
    },
    debtGate: {
      status: "seed_test",
      severity: "warn",
      maxNewPostsBeforeMetrics: 3
    },
    seedTestPlan: {
      items: [
        {
          toolId: "seed_tool",
          toolName: "Seed Tool",
          toolUrl: "https://seed.example.com",
          accountId: "ai_tools_lab",
          accountName: "AI Tools Lab",
          variantType: "shortPost",
          copyText: "A small seed post."
        }
      ],
      afterPosting: ["Mark each seed post as posted."]
    },
    pendingFeedback: []
  };
  const loop = buildLearningLoop({ ops });
  const markdown = renderLearningLoopMarkdown(loop);

  assert.equal(loop.status, "seed_ready");
  assert.equal(loop.summary.safeNewPosts, 3);
  assert.equal(loop.seedTests.length, 1);
  assert.match(loop.feedbackCsvTemplate, /Seed Tool/);
  assert.match(markdown, /Learning Loop Starter/);
});

test("learning loop blocks posting when metrics are missing", () => {
  const ops = {
    date: "2026-06-12",
    summary: {
      posted: 1,
      measured: 0,
      pending: 1,
      learningScore: 0,
      activeAccounts: 20,
      measuredAccounts: 0,
      maxNewPostsBeforeMetrics: 0
    },
    debtGate: {
      status: "blocked_no_metrics",
      severity: "bad",
      headline: "Fill metrics before posting more.",
      maxNewPostsBeforeMetrics: 0
    },
    seedTestPlan: { items: [] },
    pendingFeedback: [
      {
        id: "feedback_1",
        toolId: "pending_tool",
        toolName: "Pending Tool",
        toolUrl: "https://pending.example.com",
        accountId: "ai_tools_lab",
        accountName: "AI Tools Lab",
        variantType: "shortPost",
        copyText: "A pending post.",
        postedUrl: "https://x.com/user/status/1",
        ageHours: 3
      }
    ]
  };
  const loop = buildLearningLoop({ ops });

  assert.equal(loop.status, "blocked_until_metrics");
  assert.equal(loop.summary.safeNewPosts, 0);
  assert.equal(loop.pendingFeedback.length, 1);
  assert.match(loop.feedbackCsvTemplate, /Pending Tool/);
});

test("queue item id is stable for tool and type", () => {
  const a = buildQueueItem({ toolName: "Tool", toolUrl: "https://tool.com", type: "thread" });
  const b = buildQueueItem({ toolName: "Tool", toolUrl: "https://tool.com", type: "thread" });
  assert.equal(a.id, b.id);
  assert.equal(a.status, "new");
});

test("candidate inbox item is stable and converts to daily tool source", () => {
  const item = buildCandidateItem({
    name: "Inbox Tool",
    url: "https://inbox.example.com",
    tagline: "A narrow workflow tool",
    description: "A narrow workflow tool for Shopify teams.",
    source: "X",
    published: "2026-06-08T00:00:00.000Z"
  });
  const duplicate = buildCandidateItem({ name: "Inbox Tool", url: "https://inbox.example.com" });
  const tools = candidateInboxToTools({ items: [item] }, "2026-06-08");

  assert.equal(item.id, duplicate.id);
  assert.equal(tools[0].sourceType, "inbox");
  assert.equal(tools[0].sourceName, "X");
  assert.equal(tools[0].published, "2026-06-08T00:00:00.000Z");
});

test("source candidates preserve circle and candidate type", () => {
  const tools = sourceCandidatesToTools({
    items: [
      {
        id: "source_1",
        name: "SaaS Pricing Note",
        url: "https://source.example.com/saas",
        tagline: "A pricing signal for SaaS founders",
        description: "A pricing signal for SaaS founders",
        source: "source_1",
        sourceName: "Source",
        circle: "saas_founders",
        candidateType: "topic",
        status: "active"
      }
    ]
  }, "2026-06-12");

  assert.equal(tools[0].sourceType, "source_feed");
  assert.equal(tools[0].sourceId, "source_1");
  assert.equal(tools[0].circle, "saas_founders");
  assert.equal(tools[0].candidateType, "topic");
});

test("source quality flags off-topic crypto feed market stories", () => {
  const source = {
    id: "coindesk_crypto",
    name: "CoinDesk crypto feed",
    circle: "crypto_builders",
    candidateType: "topic",
    excludeKeywords: []
  };
  const item = {
    source: "coindesk_crypto",
    sourceName: "CoinDesk crypto feed",
    name: "Elon Musk's SpaceX soars 20% in blockbuster Nasdaq debut",
    url: "https://coindesk.example.com/spacex",
    description: "Shares rose after the IPO, with Wall Street watching the stock.",
    circle: "crypto_builders",
    candidateType: "topic",
    notes: "Crypto market and builder signal. Use only when there is a product, tooling, infrastructure, or founder angle.",
    status: "active",
    published: "2026-06-12T00:00:00.000Z"
  };
  const quality = evaluateSourceCandidateQuality(item, source);
  const tools = sourceCandidatesToTools({ items: [item] }, "2026-06-12", { sources: [source] });
  const health = buildSourceHealth({
    date: "2026-06-12",
    sourceCandidates: { items: [item] },
    scored: [],
    contentSourceConfig: {
      dailyTargets: { minimumQualityScore: 18 },
      circles: [{ id: "crypto_builders", name: "Crypto", keywords: ["crypto"] }],
      sources: [{ ...source, url: "https://coindesk.example.com/rss", enabled: true, type: "rss" }]
    }
  });

  assert.equal(quality.isNoisy, true);
  assert.match(quality.reason, /lacks a crypto/i);
  assert.equal(tools[0].sourceQuality.isNoisy, true);
  assert.equal(health.sources[0].noiseCandidates, 1);
  assert.match(health.sources[0].sampleNoiseDetails[0].reason, /lacks a crypto/i);
});

test("source quality allows crypto ETF items despite market wording", () => {
  const quality = evaluateSourceCandidateQuality({
    source: "coindesk_crypto",
    sourceName: "CoinDesk crypto feed",
    name: "BlackRock files to list its bitcoin income ETF, with expected debut next week",
    url: "https://coindesk.example.com/bitcoin-etf",
    description: "An 8-a share registration filing for Nasdaq is usually one of the last steps before a bitcoin ETF launch.",
    circle: "crypto_builders",
    candidateType: "topic",
    status: "active",
    published: "2026-06-12T00:00:00.000Z"
  }, {
    id: "coindesk_crypto",
    name: "CoinDesk crypto feed",
    circle: "crypto_builders",
    candidateType: "topic",
    excludeKeywords: []
  });

  assert.equal(quality.isNoisy, false);
  assert.equal(quality.matchedTerms.includes("bitcoin"), true);
  assert.equal(quality.matchedTerms.includes("etf"), true);
});

test("source noise is a hard skip in daily scoring and seed tests", () => {
  const sourceQuality = {
    status: "noise",
    isNoisy: true,
    reason: "Crypto source item lacks a crypto or builder-facing angle.",
    blockedTerms: ["nasdaq"],
    matchedTerms: []
  };
  const scored = scoreTool({
    name: "SpaceX Nasdaq debut market signal",
    url: "https://coindesk.example.com/spacex",
    tagline: "Market signal",
    description: "Shares rose after the IPO, with Wall Street watching the stock.",
    published: "2026-06-12T00:00:00.000Z",
    sourceName: "CoinDesk crypto feed",
    circle: "crypto_builders",
    candidateType: "topic",
    sourceQuality
  }, {
    date: "2026-06-12",
    historyIndex: new Map(),
    affiliateConfig: { links: [] }
  });
  const seedToolItem = {
    ...seedTool({ id: "noisy_crypto_story", accountId: "crypto" }),
    sourceQuality
  };
  const plan = buildFeedbackSeedTestPlan({
    latest: { generatedAt: "2026-06-12T12:00:00.000Z", tools: [seedToolItem] },
    posted: [],
    accountPosts: { items: [] },
    activeAccounts: [{ id: "crypto", displayName: "Crypto", active: true }],
    debtGate: { maxNewPostsBeforeMetrics: 3 }
  });

  assert.equal(scored.followUpAction, "skip");
  assert.equal(scored.scoreBreakdown.sourceNoisePenalty, 5);
  assert.equal(plan.items.length, 0);
});

test("fresh funding rumors are held when they lack an original operator angle", () => {
  const scored = scoreTool({
    name: "Mistral rumored to raise €3B at €20B valuation",
    url: "https://techcrunch.example.com/mistral-funding",
    tagline: "Mistral is rumored to be raising €3B at a €20B valuation.",
    description: "Mistral is rumored to be raising €3B at a €20B valuation.",
    published: "2026-06-13T00:00:00.000Z",
    sourceName: "TechCrunch AI",
    sourceType: "source_feed",
    circle: "ai_startups",
    candidateType: "topic"
  }, {
    date: "2026-06-13",
    historyIndex: new Map(),
    affiliateConfig: { links: [] }
  });

  assert.equal(scored.editorialSignals.lowOriginalityNews, true);
  assert.equal(scored.scoreBreakdown.originalityPenalty, 8);
  assert.equal(scored.followUpAction, "skip");
  assert.match(scored.reason, /lacks a clear builder/i);
});

test("media topic without workflow angle is not treated as a publish candidate", () => {
  const scored = scoreTool({
    name: "Meta’s months-old AI unit is a soul-crushing gulag, say the engineers stuck inside it",
    url: "https://techcrunch.example.com/meta-ai-unit",
    tagline: "Engineers describe internal chaos inside a new AI unit.",
    description: "Engineers describe internal chaos inside a new AI unit.",
    published: "2026-06-13T00:00:00.000Z",
    sourceName: "TechCrunch AI",
    sourceType: "source_feed",
    circle: "ai_startups",
    candidateType: "topic"
  }, {
    date: "2026-06-13",
    historyIndex: new Map(),
    affiliateConfig: { links: [] }
  });

  assert.equal(scored.editorialSignals.lowOriginalityNews, true);
  assert.equal(scored.editorialSignals.mediaTopicWithoutAction, true);
  assert.equal(scored.followUpAction, "skip");
});

test("daily model keeps generic fresh news out of publishable freshness candidates", () => {
  const model = buildDailyModel({
    date: "2026-06-13",
    feedSource: "test",
    usedFallback: false,
    tools: [
      {
        name: "Mistral rumored to raise €3B at €20B valuation",
        url: "https://techcrunch.example.com/mistral-funding",
        tagline: "Mistral is rumored to be raising €3B at a €20B valuation.",
        description: "Mistral is rumored to be raising €3B at a €20B valuation.",
        published: "2026-06-13T00:00:00.000Z",
        sourceName: "TechCrunch AI",
        sourceType: "source_feed",
        circle: "ai_startups",
        candidateType: "topic"
      }
    ],
    history: { tools: [] },
    affiliateConfig: { links: [] },
    voice: { style: { avoid: [], maxTweetCharacters: 260, allowEmoji: false } },
    limit: 5,
    warnings: []
  });

  assert.equal(model.freshnessReport.stats.lowOriginalityNews, 1);
  assert.equal(model.freshnessReport.stats.topPickFreshPostCandidates, 0);
  assert.equal(model.freshnessReport.publishableTools.length, 0);
  assert.equal(model.actionList.some((action) => action.type === "post"), false);
});

test("feedback seed plan excludes low-originality news even when it is fresh", () => {
  const plan = buildFeedbackSeedTestPlan({
    latest: {
      generatedAt: "2026-06-13T12:00:00.000Z",
      tools: [
        {
          ...seedTool({ id: "mistral_funding", accountId: "ai", score: 30, published: "2026-06-13T06:00:00.000Z" }),
          editorialSignals: { lowOriginalityNews: true },
          scoreBreakdown: { affiliateScore: 4, contentScore: 7, riskScore: 8, originalityPenalty: 8 }
        }
      ]
    },
    activeAccounts: [{ id: "ai", displayName: "AI Tools", active: true }],
    debtGate: { maxNewPostsBeforeMetrics: 3 }
  });

  assert.equal(plan.items.length, 0);
});

test("mergeToolSources keeps Product Hunt tool when inbox has duplicate", () => {
  const ph = { name: "Same Tool", url: "https://same.example.com", sourceType: "producthunt" };
  const inbox = { name: "Same Tool", url: "https://same.example.com?utm=1", sourceType: "inbox" };
  const merged = mergeToolSources([ph], [inbox]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].sourceType, "producthunt");
});

test("parseCandidatePaste handles CSV candidate rows", () => {
  const parsed = parseCandidatePaste("name,url,tagline,source\nTool,https://tool.example.com,Narrow pain,X");

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries[0].name, "Tool");
  assert.equal(parsed.entries[0].url, "https://tool.example.com");
  assert.equal(parsed.entries[0].source, "X");
});

test("parseCandidatePaste skips source-pack template rows until name and url are filled", () => {
  const csv = sourceImportRowsToCsv([
    {
      researchId: "2026-06-13-ai_startups-001",
      priority: "P1",
      name: "",
      url: "",
      tagline: "",
      source: "manual_research",
      circle: "ai_startups",
      candidateType: "product",
      sourceUrl: "https://www.google.com/search?q=ai+startup",
      published: "2026-06-13",
      researchProvider: "Google recent search",
      researchQuery: "ai startup",
      researchUrl: "https://www.google.com/search?q=ai+startup",
      acceptanceChecklist: "real URL | clear audience",
      notes: "Open search and fill only strong rows."
    },
    {
      researchId: "2026-06-13-ai_startups-002",
      priority: "P1",
      name: "Agent Ops",
      url: "https://agentops.example.com",
      tagline: "AI ops workflow for small teams",
      source: "manual_research",
      circle: "ai_startups",
      candidateType: "product",
      sourceUrl: "https://www.google.com/search?q=ai+ops",
      published: "2026-06-13",
      researchProvider: "Google recent search",
      researchQuery: "ai ops",
      researchUrl: "https://www.google.com/search?q=ai+ops",
      acceptanceChecklist: "real URL | clear audience",
      notes: "Filled row."
    }
  ]);
  const parsed = parseCandidatePaste(csv);

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].name, "Agent Ops");
});

test("parseCandidatePaste preserves seed account columns", () => {
  const parsed = parseCandidatePaste([
    "seedId,accountId,accountName,name,url,tagline,source,circle,candidateType",
    "seed-1,ai_tools_lab,AI Tools Lab,Agent CRM,https://agent.example.com,AI founder workflow automation,seed_batch_pack,ai_startups,product"
  ].join("\n"));

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries[0].accountId, "ai_tools_lab");
  assert.equal(parsed.entries[0].accountName, "AI Tools Lab");
  assert.equal(parsed.entries[0].seedId, "seed-1");
  assert.equal(buildCandidateItem(parsed.entries[0]).accountId, "ai_tools_lab");
});

test("parseCandidatePaste handles one candidate per line", () => {
  const parsed = parseCandidatePaste("Tool Name | https://tool.example.com | Fixes one clear workflow");

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries[0].name, "Tool Name");
  assert.equal(parsed.entries[0].tagline, "Fixes one clear workflow");
});

test("candidate quality gate blocks placeholder rows", () => {
  const gate = evaluateCandidateQualityGate({
    name: "Placeholder Tool",
    url: "https://example.com",
    tagline: "todo placeholder",
    circle: "ai_startups",
    candidateType: "product"
  }, { date: "2026-06-13" });

  assert.equal(gate.status, "skip");
  assert.equal(gate.tags.includes("placeholder"), true);
});

test("candidate quality gate sends broad unclear rows to review", () => {
  const gate = evaluateCandidateQualityGate({
    name: "Best AI Suite",
    url: "https://bestaisuite.ai",
    tagline: "Ultimate best AI tool for everyone",
    circle: "ai_startups",
    candidateType: "product"
  }, { date: "2026-06-13" });

  assert.notEqual(gate.status, "import");
  assert.equal(gate.tags.includes("too_broad"), true);
});

test("candidate quality gate imports specific audience and pain rows", () => {
  const gate = evaluateCandidateQualityGate({
    name: "Retention Bench",
    url: "https://retentionbench.com",
    tagline: "SaaS founders automate churn reporting workflow for small teams",
    circle: "saas_founders",
    candidateType: "product",
    published: "2026-06-13"
  }, { date: "2026-06-13" });

  assert.equal(gate.status, "import");
  assert.equal(gate.score >= 75, true);
});

test("candidate quality gate reviews crypto market-only topics", () => {
  const gate = evaluateCandidateQualityGate({
    name: "ETF Outflow Watch",
    url: "https://etfoutflowwatch.com",
    tagline: "Bitcoin price ETF outflows and trading market signal today",
    circle: "crypto_builders",
    candidateType: "topic",
    published: "2026-06-13"
  }, { date: "2026-06-13" });

  assert.notEqual(gate.status, "import");
  assert.equal(gate.tags.includes("market_only_crypto"), true);
});

test("parseCandidatePaste infers circle from pasted text", () => {
  const parsed = parseCandidatePaste([
    "Agent CRM | https://agent.example.com | AI agent workflow for sales teams",
    "Pricing Lab | https://pricing.example.com | SaaS pricing page teardown",
    "Wallet API | https://wallet.example.com | onchain wallet developer API"
  ].join("\n"));

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries[0].circle, "ai_startups");
  assert.equal(parsed.entries[1].circle, "saas_founders");
  assert.equal(parsed.entries[2].circle, "crypto_builders");
});

test("review outline uses placeholder without affiliate link", () => {
  const markdown = buildReviewOutline({ name: "Tool", url: "https://tool.com", copyVariants: {} }, null);
  assert.match(markdown, /Affiliate link not available yet/);
});

test("readJson missing file returns fallback and writeJsonAtomic writes JSON", async () => {
  const dir = "data/__tmp-test";
  const file = path.join(dir, "test.json");
  await rm(path.join(process.cwd(), dir), { recursive: true, force: true });
  assert.deepEqual(await readJson(file, { ok: true }), { ok: true });
  await writeJsonAtomic(file, { hello: "world" });
  assert.deepEqual(JSON.parse(await readFile(path.join(process.cwd(), file), "utf8")), { hello: "world" });
  await rm(path.join(process.cwd(), dir), { recursive: true, force: true });
});

test("parseCsv handles quoted commas", () => {
  assert.deepEqual(parseCsv('toolName,notes\n"Tool, Inc","nice, small tool"'), [
    ["toolName", "notes"],
    ["Tool, Inc", "nice, small tool"]
  ]);
});

test("mapFeedbackCsv resolves latest tool copy", () => {
  const latest = {
    date: "2026-06-07",
    tools: [
      {
        toolId: "tool_1",
        name: "Tool",
        url: "https://tool.com",
        copyVariants: { shortPost: "Short copy" }
      }
    ]
  };
  const result = mapFeedbackCsv("toolName,variantType,impressions,likes\nTool,shortPost,100,2", { latest });
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries[0].toolId, "tool_1");
  assert.equal(result.entries[0].copyText, "Short copy");
  assert.equal(result.entries[0].metrics.impressions, 100);
});

test("mapFeedbackCsv accepts pasted X Analytics table", () => {
  const feedback = {
    entries: [
      {
        id: "feedback_1",
        toolId: "tool_1",
        toolName: "Tool",
        toolUrl: "https://tool.com",
        variantType: "shortPost",
        copyText: "A small workflow note",
        postedUrl: "https://x.com/user/status/123"
      }
    ]
  };
  const text = [
    "Post text\tTweet permalink\tImpressions\tLikes\tBookmarks\tReplies\tReposts\tLink clicks\tProfile visits",
    "A small workflow note\thttps://x.com/user/status/123\t1,200\t18\t6\t3\t1\t9\t4"
  ].join("\n");
  const result = mapFeedbackCsv(text, { feedback });

  assert.equal(result.errors.length, 0);
  assert.equal(result.entries[0].id, "feedback_1");
  assert.equal(result.entries[0].toolName, "Tool");
  assert.equal(result.entries[0].metrics.impressions, 1200);
  assert.equal(result.entries[0].metrics.clicks, 9);
  assert.equal(result.entries[0].metrics.profileVisits, 4);
});

test("mapFeedbackCsv matches feedback id and modern X metric headers", () => {
  const feedback = {
    entries: [
      {
        id: "feedback_modern",
        toolId: "tool_modern",
        toolName: "Modern Tool",
        toolUrl: "https://modern.example.com",
        variantType: "painPointHook",
        accountId: "ai_founder_signals",
        accountName: "AI Founder Signals",
        sourceName: "Founder Feed",
        sourceType: "rss",
        circle: "ai_startups",
        copyText: "A founder workflow note",
        postedUrl: "https://x.com/user/status/456",
        postedAt: "2026-06-12T10:00:00.000Z"
      }
    ]
  };
  const text = [
    "Feedback ID\tViews\tLikes\tSaves\tReplies\tReposts\tURL clicks\tProfile clicks\tNotes",
    "feedback_modern\t2,400\t30\t11\t4\t2\t14\t5\tgood first signal"
  ].join("\n");
  const result = mapFeedbackCsv(text, { feedback });

  assert.equal(result.errors.length, 0);
  assert.equal(result.entries[0].id, "feedback_modern");
  assert.equal(result.entries[0].toolName, "Modern Tool");
  assert.equal(result.entries[0].accountId, "ai_founder_signals");
  assert.equal(result.entries[0].sourceName, "Founder Feed");
  assert.equal(result.entries[0].circle, "ai_startups");
  assert.equal(result.entries[0].postedAt, "2026-06-12T10:00:00.000Z");
  assert.equal(result.entries[0].metrics.impressions, 2400);
  assert.equal(result.entries[0].metrics.bookmarks, 11);
  assert.equal(result.entries[0].metrics.clicks, 14);
  assert.equal(result.entries[0].metrics.profileVisits, 5);
  assert.equal(result.entries[0].matchStatus, "matched_feedback");
  assert.equal(result.entries[0].metricStatus, "metrics_found");
});

test("daily model ignores same-day history when marking seen-before", () => {
  const tool = {
    name: "Narrow Shopify Tool",
    url: "https://example.com/shopify",
    tagline: "Fix one Shopify workflow",
    description: "A Shopify automation tool for store teams that fixes one repeated workflow without code.",
    published: "2026-06-08T00:00:00.000Z"
  };
  const base = {
    date: "2026-06-08",
    feedSource: "test",
    usedFallback: false,
    tools: [tool],
    affiliateConfig: { links: [] },
    voice: { style: { avoid: [], maxTweetCharacters: 260, allowEmoji: false } },
    limit: 1,
    warnings: []
  };
  const sameDay = buildDailyModel({
    ...base,
    history: { tools: [{ date: "2026-06-08", toolName: tool.name, url: tool.url, score: 20 }] }
  });
  const priorDay = buildDailyModel({
    ...base,
    history: { tools: [{ date: "2026-06-07", toolName: tool.name, url: tool.url, score: 20 }] }
  });

  assert.equal(sameDay.picked[0].seenBefore, false);
  assert.equal(sameDay.picked[0].scoreBreakdown.seenPenalty, 0);
  assert.equal(sameDay.actionList.some((action) => action.type === "post"), true);
  assert.equal(sameDay.freshnessReport.stats.topPickFreshPostCandidates, 1);
  assert.equal(priorDay.picked[0].seenBefore, true);
  assert.equal(priorDay.actionList.some((action) => action.type === "post"), false);
});

test("daily model uses measured feedback as a small next-day learning signal", () => {
  const winnerTool = {
    name: "Founder Email Workflow",
    url: "https://winner.example.com",
    tagline: "Email automation for startup founders",
    description: "Email automation for startup founders with pricing, analytics, and a clear onboarding workflow.",
    published: "2026-06-12T00:00:00.000Z",
    sourceName: "Founder Feed",
    sourceType: "rss",
    circle: "ai_startups"
  };
  const otherTool = {
    name: "Generic Email Workflow",
    url: "https://other.example.com",
    tagline: "Email automation for startup founders",
    description: "Email automation for startup founders with pricing, analytics, and a clear onboarding workflow.",
    published: "2026-06-12T00:00:00.000Z",
    sourceName: "Other Feed",
    sourceType: "rss",
    circle: "ai_startups"
  };
  const feedback = {
    entries: [
      buildFeedbackEntry({
        toolId: createToolId("Old Winner", "https://old.example.com"),
        toolName: "Old Winner",
        toolUrl: "https://old.example.com",
        variantType: "painPointHook",
        accountId: "ai_founder_signals",
        accountName: "AI Founder Signals",
        sourceName: "Founder Feed",
        sourceType: "rss",
        circle: "ai_startups",
        copyText: "Measured winner",
        posted: true,
        metrics: { impressions: 2000, likes: 40, bookmarks: 15, replies: 4, clicks: 12 }
      })
    ]
  };
  const model = buildDailyModel({
    date: "2026-06-12",
    feedSource: "test",
    usedFallback: false,
    tools: [otherTool, winnerTool],
    history: { tools: [] },
    affiliateConfig: { links: [] },
    accountConfig: {
      accounts: [{ id: "ai_founder_signals", displayName: "AI Founder Signals", category: "AI startup circle", active: true, dailyPostLimit: 10, cooldownHours: 3 }]
    },
    feedback,
    accountPosts: { items: [] },
    queues: { items: [] },
    voice: { style: { avoid: [], maxTweetCharacters: 260, allowEmoji: false } },
    limit: 2,
    warnings: []
  });
  const winner = model.picked.find((item) => item.tool.url === winnerTool.url);
  const other = model.picked.find((item) => item.tool.url === otherTool.url);

  assert.equal(model.feedbackLearningSignals.status, "early_learning");
  assert.equal(model.feedbackLearningSignals.topSources[0].sourceName, "Founder Feed");
  assert.equal(winner.scoreBreakdown.learningScore > 0, true);
  assert.equal(winner.scoreBreakdown.learningScore > other.scoreBreakdown.learningScore, true);
  assert.match(winner.reason, /feedback learning boost/);
});

test("daily model reports feed freshness even when top picks are old", () => {
  const tools = [
    {
      name: "Old Better Tool",
      url: "https://old.example.com",
      tagline: "Shopify email automation for store teams",
      description: "Shopify email automation for store teams with pricing and customer workflow support.",
      published: "2026-06-01T00:00:00.000Z"
    },
    {
      name: "Fresh Narrow Shopify Signal",
      url: "https://fresh.example.com",
      tagline: "Shopify pricing automation for small store teams",
      description: "Shopify pricing automation for small store teams with a clear workflow and buyer.",
      published: "2026-06-08T00:00:00.000Z"
    }
  ];
  const model = buildDailyModel({
    date: "2026-06-08",
    feedSource: "test",
    usedFallback: false,
    tools,
    history: { tools: [] },
    affiliateConfig: { links: [] },
    voice: { style: { avoid: [], maxTweetCharacters: 260, allowEmoji: false } },
    limit: 1,
    warnings: []
  });

  assert.equal(model.freshnessReport.stats.freshToday, 1);
  assert.equal(model.freshnessReport.freshFeedWatchlist[0].name, "Fresh Narrow Shopify Signal");
  assert.match(model.freshnessReport.diagnosis, /fresh tools/i);
});

test("daily model keeps noisy source items out of fresh watchlist", () => {
  const model = buildDailyModel({
    date: "2026-06-12",
    feedSource: "test",
    usedFallback: false,
    tools: [
      {
        name: "SpaceX Nasdaq debut market signal",
        url: "https://coindesk.example.com/spacex",
        tagline: "Market signal",
        description: "Shares rose after the IPO, with Wall Street watching the stock.",
        published: "2026-06-12T00:00:00.000Z",
        sourceName: "CoinDesk crypto feed",
        circle: "crypto_builders",
        candidateType: "topic",
        sourceQuality: {
          status: "noise",
          isNoisy: true,
          reason: "Crypto source item lacks a crypto or builder-facing angle.",
          blockedTerms: ["nasdaq"],
          matchedTerms: []
        }
      },
      {
        name: "Onchain ads platform launch",
        url: "https://coindesk.example.com/onchain-ads",
        tagline: "Arbitrum helped a TV maker launch an onchain ads platform.",
        description: "A blockchain advertising platform for onchain infrastructure teams.",
        published: "2026-06-12T00:00:00.000Z",
        sourceName: "CoinDesk crypto feed",
        circle: "crypto_builders",
        candidateType: "topic",
        sourceQuality: {
          status: "ok",
          isNoisy: false,
          reason: "Matched crypto/source terms.",
          blockedTerms: [],
          matchedTerms: ["onchain", "blockchain"]
        }
      }
    ],
    history: { tools: [] },
    affiliateConfig: { links: [] },
    voice: { style: { avoid: [], maxTweetCharacters: 260, allowEmoji: false } },
    limit: 5,
    warnings: []
  });

  assert.equal(model.freshnessReport.freshFeedWatchlist.some((item) => item.name.includes("SpaceX")), false);
  assert.equal(model.freshnessReport.freshFeedWatchlist.some((item) => item.name.includes("Onchain")), true);
});

test("topic copy reads as market signal, not tool review", () => {
  const variants = makeCopyVariants({
    tool: {
      name: "AI funding signal",
      url: "https://news.example.com",
      description: "A funding note about AI automation teams.",
      candidateType: "topic",
      sourceName: "Source"
    },
    angle: {
      audience: "AI founders",
      pain: "finding sharper market timing",
      solution: "A funding note about AI automation teams.",
      outcome: "a sharper startup workflow"
    }
  }, { style: { avoid: [], maxTweetCharacters: 280, allowEmoji: false } });

  assert.match(variants.find((item) => item.label === "shortPost").text, /not treat it as a tool review/i);
  assert.match(variants.find((item) => item.label === "casualPost").text, /market signal/i);
});

test("copy variants stay under the raw X 280 character limit", () => {
  const variants = makeCopyVariants({
    tool: {
      name: "Meta's months-old AI unit is a soul-crushing gulag, say the engineers stuck inside it",
      url: "https://techcrunch.com/2026/06/12/metas-months-old-ai-unit-is-a-soul-crushing-gulag-say-the-engineers-stuck-inside-it/?utm_source=very-long-tracking-parameter",
      description: "Engineers describe internal chaos inside a new AI unit, with a lot of context that would otherwise make the post too long.",
      candidateType: "topic",
      sourceName: "TechCrunch AI"
    },
    angle: {
      audience: "AI founders",
      pain: "understanding whether big-lab chaos changes small-team strategy",
      solution: "Engineers describe internal chaos inside a new AI unit.",
      outcome: "a sharper startup workflow"
    }
  }, { style: { avoid: [], maxTweetCharacters: 280, allowEmoji: false } });

  assert.equal(variants.every((item) => item.text.length <= 280), true);
  assert.equal(variants.every((item) => item.lint.ok), true);
});

test("account strategy recommends matching account profile", () => {
  const item = {
    tool: {
      name: "Shopify Helper",
      url: "https://shopify.example.com",
      tagline: "Support automation for Shopify stores",
      description: "Support automation for Shopify stores"
    },
    angle: { audience: "ecommerce operators", outcome: "cleaner store operations", pain: "support cleanup" },
    followUpAction: "affiliate priority",
    scoreBreakdown: { contentScore: 7, affiliateScore: 8 }
  };
  const accountConfig = {
    rotationPolicy: { maxAccounts: 10, defaultDailyPostLimit: 2 },
    accounts: [
      { id: "general", displayName: "General AI", keywords: ["AI"], preferredActions: ["tweet only"], active: true },
      { id: "ecom", displayName: "Ecommerce Ops", keywords: ["Shopify", "ecommerce", "support"], preferredActions: ["affiliate priority"], active: true }
    ]
  };
  const recommendation = recommendAccountForItem(item, accountConfig);
  const strategy = buildAccountStrategy({ date: "2026-06-12", picked: [item], accountConfig });

  assert.equal(recommendation.primary.accountId, "ecom");
  assert.equal(strategy.summary.activeAccounts, 2);
  assert.equal(strategy.summary.routedTools, 1);
});

test("account strategy does not match short keywords inside unrelated words", () => {
  const item = {
    tool: {
      name: "Canton Network developer raises funding to bring Wall Street onchain",
      url: "https://coindesk.example.com/canton",
      tagline: "Crypto infrastructure funding signal",
      description: "Onchain infrastructure for institutional crypto builders.",
      circle: "crypto_builders",
      sourceName: "CoinDesk crypto feed"
    },
    angle: { audience: "crypto builders", outcome: "onchain infrastructure", pain: "tracking crypto builder signals" },
    followUpAction: "tweet only",
    scoreBreakdown: { contentScore: 8, affiliateScore: 1 }
  };
  const accountConfig = {
    rotationPolicy: { maxAccounts: 10, defaultDailyPostLimit: 2 },
    accounts: [
      { id: "ai", displayName: "AI Founder Signals", keywords: ["AI", "agent"], preferredActions: ["tweet only"], active: true },
      { id: "crypto", displayName: "Crypto Builder Radar", keywords: ["crypto", "onchain"], preferredActions: ["tweet only"], active: true }
    ]
  };

  const recommendation = recommendAccountForItem(item, accountConfig);

  assert.equal(recommendation.primary.accountId, "crypto");
  assert.equal(recommendation.alternatives.some((account) => account.accountId === "ai" && account.matchedKeywords.includes("AI")), false);
});

test("account strategy treats underscored circle ids as account pillars", () => {
  const item = {
    tool: {
      name: "SpaceX Nasdaq debut market signal",
      url: "https://coindesk.example.com/spacex",
      tagline: "Market signal",
      description: "",
      circle: "crypto_builders",
      sourceName: "CoinDesk feed"
    },
    angle: { audience: "solo operators", outcome: "market signal", pain: "removing one narrow repeated manual step" },
    followUpAction: "tweet only",
    scoreBreakdown: { contentScore: 7, affiliateScore: 2 }
  };
  const accountConfig = {
    rotationPolicy: { maxAccounts: 10, defaultDailyPostLimit: 2 },
    accounts: [
      { id: "ai", displayName: "AI Agent Ops", keywords: ["workflow"], preferredActions: ["tweet only"], active: true },
      { id: "crypto", displayName: "Crypto Builder Radar", contentPillars: ["crypto builders"], keywords: [], preferredActions: ["tweet only"], active: true }
    ]
  };

  const recommendation = recommendAccountForItem(item, accountConfig);

  assert.equal(recommendation.primary.accountId, "crypto");
  assert.deepEqual(recommendation.primary.matchedPillars, ["crypto builders"]);
});

test("account strategy respects daily post limits when routing", () => {
  const picked = [
    {
      tool: { name: "AI Helper One", url: "https://one.example.com", tagline: "AI workflow helper" },
      angle: { audience: "builders", outcome: "cleaner workflows", pain: "manual work" },
      followUpAction: "tweet only",
      scoreBreakdown: { contentScore: 8, affiliateScore: 3 }
    },
    {
      tool: { name: "AI Helper Two", url: "https://two.example.com", tagline: "AI workflow helper" },
      angle: { audience: "builders", outcome: "cleaner workflows", pain: "manual work" },
      followUpAction: "tweet only",
      scoreBreakdown: { contentScore: 8, affiliateScore: 3 }
    }
  ];
  const accountConfig = {
    rotationPolicy: { maxAccounts: 10, defaultDailyPostLimit: 2 },
    accounts: [
      { id: "ai", displayName: "AI Tools", keywords: ["AI", "workflow"], preferredActions: ["tweet only"], dailyPostLimit: 1, active: true },
      { id: "build", displayName: "Build Notes", keywords: ["workflow"], preferredActions: ["tweet only"], dailyPostLimit: 2, active: true }
    ]
  };
  const strategy = buildAccountStrategy({ date: "2026-06-12", picked, accountConfig });

  assert.equal(strategy.toolRecommendations[0].primary.accountId, "ai");
  assert.equal(strategy.toolRecommendations[1].primary.accountId, "build");
  assert.equal(strategy.accounts.find((account) => account.id === "ai").plannedToolsToday, 1);
});

test("account conflict radar blocks same tool across accounts", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  const accountConfig = {
    rotationPolicy: { sameToolCooldownDays: 7, sameCopyCooldownDays: 30 },
    accounts: [
      { id: "ai", displayName: "AI Tools", active: true, cooldownHours: 6 },
      { id: "saas", displayName: "SaaS Notes", active: true, cooldownHours: 6 }
    ]
  };
  const accountPosts = {
    items: [
      buildAccountPost({
        accountId: "ai",
        accountName: "AI Tools",
        toolId: "tool_same",
        toolName: "Same Tool",
        toolUrl: "https://same.example.com",
        copyText: "First copy",
        postedAt: "2026-06-12T12:00:00.000Z"
      }),
      buildAccountPost({
        accountId: "saas",
        accountName: "SaaS Notes",
        toolId: "tool_same",
        toolName: "Same Tool",
        toolUrl: "https://same.example.com",
        copyText: "Second copy",
        postedAt: "2026-06-13T08:00:00.000Z"
      })
    ]
  };
  const latest = {
    tools: [
      {
        toolId: "tool_same",
        name: "Same Tool",
        url: "https://same.example.com",
        score: 42,
        accountRecommendation: { primary: { accountId: "saas" } },
        copyVariants: { shortPost: "Fresh copy" }
      }
    ]
  };
  const radar = buildAccountConflictRadar({
    date: "2026-06-13",
    latest,
    accountPosts,
    feedback: { entries: [] },
    accountConfig,
    now
  });

  assert.equal(radar.summary.sameToolConflicts, 1);
  assert.equal(radar.summary.blockedCandidates, 1);
  assert.equal(radar.candidateRisks[0].riskLevel, "blocked");
  assert.match(radar.candidateRisks[0].reasons[0], /Same tool\/URL/);
});

test("account conflict radar detects account cooldown conflicts", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  const accountConfig = {
    accounts: [
      { id: "ai", displayName: "AI Tools", active: true, cooldownHours: 6 }
    ]
  };
  const accountPosts = {
    items: [
      buildAccountPost({
        accountId: "ai",
        accountName: "AI Tools",
        toolId: "tool_1",
        toolName: "Tool 1",
        toolUrl: "https://one.example.com",
        postedAt: "2026-06-13T08:00:00.000Z"
      }),
      buildAccountPost({
        accountId: "ai",
        accountName: "AI Tools",
        toolId: "tool_2",
        toolName: "Tool 2",
        toolUrl: "https://two.example.com",
        postedAt: "2026-06-13T10:00:00.000Z"
      })
    ]
  };
  const radar = buildAccountConflictRadar({
    date: "2026-06-13",
    latest: { tools: [] },
    accountPosts,
    feedback: { entries: [] },
    accountConfig,
    now
  });

  assert.equal(radar.summary.cooldownConflicts, 1);
  assert.equal(radar.conflicts.cooldown[0].accountId, "ai");
  assert.equal(radar.conflicts.cooldown[0].spacingHours, 2);
});

test("supply plan reports account-specific shortages", () => {
  const scored = [
    {
      tool: { name: "AI Tool", url: "https://ai.example.com", description: "AI workflow tool", circle: "ai_startups" },
      followUpAction: "tweet only",
      score: 22
    }
  ];
  const accountStrategy = {
    summary: { activeAccounts: 2 },
    accounts: [
      { id: "ai", displayName: "AI", category: "AI", keywords: ["AI"], contentPillars: [] },
      { id: "saas", displayName: "SaaS", category: "SaaS", keywords: ["SaaS"], contentPillars: [] }
    ]
  };
  const plan = buildSupplyPlan({
    date: "2026-06-12",
    scored,
    accountStrategy,
    contentSourceConfig: {
      dailyTargets: { accounts: 2, postsPerAccount: 1, minimumQualityScore: 18 },
      circles: [{ id: "ai_startups", name: "AI", keywords: ["AI"] }],
      sources: []
    }
  });

  assert.equal(plan.status, "short");
  assert.equal(plan.accountCoverage.find((account) => account.accountId === "ai").gap, 0);
  assert.equal(plan.accountCoverage.find((account) => account.accountId === "saas").gap, 1);
});

test("source quality queue turns supply gaps into research tasks", () => {
  const queue = buildSourceQualityQueue({
    supplyPlan: {
      targetPerAccount: 10,
      accountCoverage: [
        { accountId: "saas_growth", displayName: "SaaS Growth", category: "SaaS", gap: 8 },
        { accountId: "crypto_tools", displayName: "Crypto Tools", category: "crypto", gap: 3 }
      ],
      circleCoverage: [
        { circleId: "saas_founders", name: "SaaS founder circle", qualifiedTools: 1 },
        { circleId: "crypto_builders", name: "Crypto builder circle", qualifiedTools: 5 }
      ]
    },
    contentSourceConfig: {
      dailyTargets: { accounts: 20, postsPerAccount: 10, minimumQualityScore: 18 },
      circles: [
        { id: "saas_founders", name: "SaaS founder circle", keywords: ["SaaS"] },
        { id: "crypto_builders", name: "Crypto builder circle", keywords: ["crypto"] }
      ],
      sources: []
    }
  });

  assert.equal(queue.items[0].circleId, "saas_founders");
  assert.equal(queue.items[0].neededCandidates >= 8, true);
  assert.equal(queue.items[0].searchQueries.length > 0, true);
});

test("source health flags noisy low-quality sources", () => {
  const health = buildSourceHealth({
    date: "2026-06-12",
    sourceCandidates: {
      items: [
        {
          source: "noisy_crypto",
          toolId: "tool_noise_1",
          name: "Bitcoin price prediction resistance test",
          url: "https://noise.example.com/1",
          description: "Price prediction and resistance test for bulls",
          circle: "crypto_builders",
          candidateType: "topic",
          status: "active",
          published: "2026-06-12T00:00:00.000Z"
        },
        {
          source: "noisy_crypto",
          toolId: "tool_noise_2",
          name: "Market live updates",
          url: "https://noise.example.com/2",
          description: "Live updates about price rockets",
          circle: "crypto_builders",
          candidateType: "topic",
          status: "active",
          published: "2026-06-12T00:00:00.000Z"
        }
      ]
    },
    scored: [
      { toolId: "tool_noise_1", score: 8, followUpAction: "skip" },
      { toolId: "tool_noise_2", score: 9, followUpAction: "skip" }
    ],
    contentSourceConfig: {
      dailyTargets: { minimumQualityScore: 18 },
      circles: [{ id: "crypto_builders", name: "Crypto", keywords: ["crypto"] }],
      sources: [
        {
          id: "noisy_crypto",
          name: "Noisy Crypto",
          circle: "crypto_builders",
          type: "rss",
          candidateType: "topic",
          url: "https://noise.example.com/rss",
          enabled: true,
          includeKeywords: ["bitcoin"],
          excludeKeywords: ["price prediction", "live updates"]
        }
      ]
    }
  });

  assert.equal(health.sources[0].status, "disable_candidate");
  assert.equal(health.sources[0].noiseCandidates, 2);
  assert.equal(health.recommendations.some((item) => item.includes("Noisy Crypto")), true);
});

test("source health rewards useful qualified sources", () => {
  const health = buildSourceHealth({
    date: "2026-06-12",
    sourceCandidates: {
      items: [
        {
          source: "clean_saas",
          toolId: "tool_clean_1",
          name: "SaaS onboarding teardown",
          url: "https://clean.example.com/1",
          description: "A SaaS onboarding workflow case study",
          circle: "saas_founders",
          candidateType: "topic",
          status: "active",
          published: "2026-06-12T00:00:00.000Z"
        },
        {
          source: "clean_saas",
          toolId: "tool_clean_2",
          name: "B2B pricing page launch",
          url: "https://clean.example.com/2",
          description: "A pricing page launch for B2B SaaS founders",
          circle: "saas_founders",
          candidateType: "product",
          status: "active",
          published: "2026-06-12T00:00:00.000Z"
        }
      ]
    },
    scored: [
      { toolId: "tool_clean_1", score: 28, followUpAction: "thread candidate" },
      { toolId: "tool_clean_2", score: 31, followUpAction: "review page candidate" }
    ],
    contentSourceConfig: {
      dailyTargets: { minimumQualityScore: 18 },
      circles: [{ id: "saas_founders", name: "SaaS", keywords: ["SaaS"] }],
      sources: [
        {
          id: "clean_saas",
          name: "Clean SaaS",
          circle: "saas_founders",
          type: "rss",
          candidateType: "topic",
          url: "https://clean.example.com/rss",
          enabled: true,
          includeKeywords: ["SaaS"],
          excludeKeywords: ["lawsuit"]
        }
      ]
    }
  });

  assert.equal(health.sources[0].status, "healthy");
  assert.equal(health.sources[0].qualifiedCandidates, 2);
  assert.equal(health.summary.healthySources, 1);
});

test("source discovery pack turns gaps into search links", () => {
  const discovery = buildSourceDiscoveryPack({
    date: "2026-06-12",
    sourceQualityQueue: {
      items: [
        {
          circleId: "saas_founders",
          circleName: "SaaS founder circle",
          priorityScore: 20,
          neededCandidates: 12,
          currentQualifiedTools: 2,
          importHint: "Add SaaS candidates",
          searchQueries: ["\"SaaS pricing\" \"case study\""],
          recommendedSources: []
        }
      ]
    },
    contentSourceConfig: {
      circles: [{ id: "saas_founders", name: "SaaS founder circle", keywords: ["SaaS"] }],
      sources: []
    }
  });
  const markdown = renderSourceDiscoveryMarkdown(discovery);

  assert.equal(discovery.summary.totalNeededCandidates, 12);
  assert.equal(discovery.circles[0].searchLinks.some((link) => link.label === "X live search"), true);
  assert.equal(discovery.circles[0].searchLinks.every((link) => link.url.startsWith("https://")), true);
  assert.match(markdown, /Source Discovery Pack/);
});

test("source import pack creates 100 pre-classified rows", () => {
  const rows = buildSourceImportPackRows({
    sourceQualityQueue: {
      items: [
        { circleId: "saas_founders", circleName: "SaaS", neededCandidates: 80, searchQueries: ["saas query"] },
        { circleId: "crypto_builders", circleName: "Crypto", neededCandidates: 20, searchQueries: ["crypto query"] }
      ]
    },
    totalRows: 100,
    date: "2026-06-12"
  });

  assert.equal(rows.length, 100);
  assert.equal(rows.filter((row) => row.circle === "saas_founders").length > rows.filter((row) => row.circle === "crypto_builders").length, true);
  assert.equal(rows.every((row) => ["product", "topic"].includes(row.candidateType)), true);
  assert.equal(rows.every((row) => row.researchId), true);
  assert.equal(rows.every((row) => row.researchUrl?.startsWith("https://")), true);
  assert.equal(rows.every((row) => row.sourceUrl === row.researchUrl), true);
  assert.equal(rows.every((row) => row.acceptanceChecklist?.includes("real URL")), true);
  assert.equal(rows.some((row) => row.priority === "P0"), true);

  const csv = sourceImportRowsToCsv([
    {
      ...rows[0],
      name: "Example SaaS Tool",
      url: "https://example-saas.test",
      tagline: "Fixes one narrow SaaS workflow"
    }
  ]);
  assert.match(csv.split("\n")[0], /researchUrl/);
  const parsed = parseCandidatePaste(csv);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].sourceUrl.startsWith("https://"), true);
});

test("source import pack summarizes rows for dashboard", () => {
  const pack = buildSourceImportPack({
    date: "2026-06-12",
    sourceQualityQueue: {
      summary: { totalNeededCandidates: 100, topCircle: "SaaS" },
      items: [
        { circleId: "saas_founders", circleName: "SaaS", neededCandidates: 80, currentQualifiedTools: 2, searchQueries: ["saas query"], importHint: "Add SaaS candidates" },
        { circleId: "crypto_builders", circleName: "Crypto", neededCandidates: 20, currentQualifiedTools: 1, searchQueries: ["crypto query"], importHint: "Add crypto candidates" }
      ]
    },
    totalRows: 100,
    csvPath: "output/source-import-pack/2026-06-12-source-import-template.csv",
    guidePath: "output/source-import-pack/2026-06-12-source-import-guide.md"
  });

  assert.equal(pack.summary.totalRows, 100);
  assert.equal(pack.summary.topCircle, "SaaS");
  assert.equal(pack.summary.csvPath.endsWith(".csv"), true);
  assert.equal(pack.summary.rowsWithResearchUrl, 100);
  assert.equal(pack.rowsByCircle[0].circleId, "saas_founders");
  assert.equal(pack.rowsByCandidateType.some((item) => item.candidateType === "product"), true);
  assert.equal(pack.rowsByResearchProvider.length > 0, true);
  assert.equal(pack.collectionPlan.firstBatch.length > 0, true);
  assert.match(pack.collectionPlan.rule, /Fill name/);
  assert.equal(pack.priorityGaps.length, 2);
});

test("supply gap filler turns source and account gaps into manual refill batches", () => {
  const sourceImportPack = buildSourceImportPack({
    date: "2026-06-12",
    sourceQualityQueue: {
      summary: { totalNeededCandidates: 25, topCircle: "SaaS" },
      items: [
        {
          circleId: "saas_founders",
          circleName: "SaaS founder circle",
          neededCandidates: 20,
          currentQualifiedTools: 1,
          affectedAccounts: [{ accountId: "saas", displayName: "SaaS Pricing Lab", gap: 9 }],
          searchQueries: ["saas query"],
          importHint: "Add SaaS candidates"
        },
        {
          circleId: "indie_hackers",
          circleName: "Indie hacker circle",
          neededCandidates: 5,
          currentQualifiedTools: 3,
          affectedAccounts: [],
          searchQueries: ["indie query"],
          importHint: "Add indie candidates"
        }
      ]
    },
    totalRows: 30
  });
  const plan = buildSupplyGapFiller({
    date: "2026-06-12",
    latest: {
      date: "2026-06-12",
      sourceQualityQueue: {
        summary: { totalNeededCandidates: 25 },
        items: []
      }
    },
    sourceImportPack,
    accountRefillWorkbench: {
      summary: { targetDailyPosts: 20, postableToday: 1, totalRefillNeed: 8, contentBlockedAccounts: 1, feedbackBlockedAccounts: 2 },
      focusAccounts: [
        {
          accountId: "saas",
          displayName: "SaaS Pricing Lab",
          status: "needs_drafts",
          statusLabel: "缺草稿",
          refillNeed: 8,
          postableToday: 0,
          targetPosts: 10,
          searchLinks: [{ provider: "Google", query: "saas", url: "https://www.google.com/search?q=saas" }],
          searchUrls: ["https://www.google.com/search?q=saas"],
          csv: "accountId,accountName,priority,name,url,tagline\nsaas,SaaS Pricing Lab,P1,,,,",
          csvRows: 1
        }
      ]
    }
  });
  const markdown = renderSupplyGapFillerMarkdown(plan);
  const parsedBlankBatch = parseCandidatePaste(plan.todayBatches[0].csv);

  assert.equal(plan.status, "needs_supply");
  assert.equal(plan.summary.totalNeededCandidates, 25);
  assert.equal(plan.summary.totalRefillNeed, 8);
  assert.equal(plan.todayBatches[0].circleId, "saas_founders");
  assert.equal(plan.todayBatches[0].affectedAccounts[0].accountId, "saas");
  assert.equal(plan.todayBatches[0].searchUrls.every((url) => url.startsWith("https://")), true);
  assert.equal(plan.todayBatches[0].rows.every((row) => !row.name && !row.url && !row.tagline), true);
  assert.equal(parsedBlankBatch.entries.length, 0);
  assert.equal(plan.accountBatches[0].accountId, "saas");
  assert.match(plan.todayBatches[0].csv, /researchId,priority,name,url,tagline/);
  assert.match(markdown, /Supply Gap Filler/);
  assert.match(markdown, /Fill only real/);
});

test("source supply workbench merges gaps, discovery, and health", () => {
  const queue = {
    summary: { items: 1, totalNeededCandidates: 12, topCircle: "SaaS founder circle" },
    items: [
      {
        circleId: "saas_founders",
        circleName: "SaaS founder circle",
        priorityScore: 20,
        neededCandidates: 12,
        currentQualifiedTools: 2,
        affectedAccounts: [{ accountId: "saas_growth", displayName: "SaaS Growth", gap: 8 }],
        searchQueries: ["\"SaaS pricing\" \"case study\""],
        importHint: "Add SaaS candidates"
      }
    ]
  };
  const discovery = buildSourceDiscoveryPack({
    date: "2026-06-12",
    sourceQualityQueue: queue,
    contentSourceConfig: {
      circles: [{ id: "saas_founders", name: "SaaS founder circle", keywords: ["SaaS"] }],
      sources: []
    }
  });
  const health = buildSourceHealth({
    date: "2026-06-12",
    sourceCandidates: {
      items: [{
        source: "clean_saas",
        toolId: "tool_clean_1",
        name: "SaaS onboarding teardown",
        url: "https://clean.example.com/1",
        description: "A SaaS onboarding workflow case study",
        circle: "saas_founders",
        candidateType: "topic",
        status: "active",
        published: "2026-06-12T00:00:00.000Z"
      }]
    },
    scored: [{ toolId: "tool_clean_1", score: 28, followUpAction: "thread candidate" }],
    contentSourceConfig: {
      dailyTargets: { minimumQualityScore: 18 },
      circles: [{ id: "saas_founders", name: "SaaS founder circle", keywords: ["SaaS"] }],
      sources: [{
        id: "clean_saas",
        name: "Clean SaaS",
        circle: "saas_founders",
        type: "rss",
        candidateType: "topic",
        url: "https://clean.example.com/rss",
        enabled: true,
        includeKeywords: ["SaaS"],
        excludeKeywords: []
      }]
    },
    sourceQualityQueue: queue
  });
  const workbench = buildSourceSupplyWorkbench({
    date: "2026-06-12",
    supplyPlan: { targetDrafts: 20, qualifiedTools: 2, possibleDrafts: 10, totalGap: 10, targetAccounts: 2, targetPerAccount: 10 },
    sourceQualityQueue: queue,
    sourceDiscovery: discovery,
    sourceHealth: health,
    candidateInbox: { items: [{ status: "active" }] },
    sourceCandidates: { items: [{ status: "active" }] }
  });
  const markdown = renderSourceSupplyWorkbenchMarkdown(workbench);

  assert.equal(workbench.status, "needs_supply");
  assert.equal(workbench.summary.totalNeededCandidates, 12);
  assert.equal(workbench.summary.activeInboxCount, 1);
  assert.equal(workbench.circles[0].searchLinks.some((link) => link.label === "X live search"), true);
  assert.match(workbench.circles[0].importTemplate, /name,url,tagline/);
  assert.match(markdown, /Source Supply Workbench/);
});

test("draft plan allocates each tool only once across accounts", () => {
  const picked = [
    {
      tool: { name: "AI Tool", url: "https://ai.example.com", sourceName: "PH", circle: "ai_startups" },
      toolId: "tool_ai",
      score: 30,
      followUpAction: "tweet only",
      accountRecommendation: { primary: { accountId: "ai", matchedKeywords: ["AI"], matchedPillars: [] }, alternatives: [{ accountId: "saas", matchedKeywords: ["SaaS"], matchedPillars: [] }] },
      copyVariants: [{ label: "shortPost", text: "AI copy" }]
    },
    {
      tool: { name: "SaaS Tool", url: "https://saas.example.com", sourceName: "Manual", circle: "saas_founders" },
      toolId: "tool_saas",
      score: 28,
      followUpAction: "thread candidate",
      accountRecommendation: { primary: { accountId: "saas", matchedKeywords: ["SaaS"], matchedPillars: [] }, alternatives: [] },
      copyVariants: [{ label: "threadOpening", text: "SaaS thread" }, { label: "shortPost", text: "SaaS copy" }]
    }
  ];
  const plan = buildDraftPlan({
    date: "2026-06-12",
    picked,
    accountStrategy: {
      accounts: [
        { id: "ai", displayName: "AI", category: "AI", keywords: ["AI"], contentPillars: [] },
        { id: "saas", displayName: "SaaS", category: "SaaS", keywords: ["SaaS"], contentPillars: [] }
      ],
      toolRecommendations: picked.map((item) => ({ toolId: item.toolId, ...item.accountRecommendation }))
    },
    targetPerAccount: 1
  });
  const allocatedToolIds = plan.accountPlans.flatMap((account) => account.drafts.map((draft) => draft.toolId));

  assert.equal(new Set(allocatedToolIds).size, allocatedToolIds.length);
  assert.equal(allocatedToolIds.length, 2);
  assert.equal(plan.summary.gap, 0);
});

test("content calendar exposes cooldown target conflicts", () => {
  const calendar = buildContentCalendar({
    date: "2026-06-12",
    draftPlan: {
      accountPlans: [
        {
          accountId: "ai",
          displayName: "AI",
          category: "AI",
          targetPosts: 10,
          drafts: Array.from({ length: 10 }, (_, index) => ({
            toolId: `tool_${index}`,
            toolName: `Tool ${index}`,
            variantType: "shortPost",
            copyText: `Copy ${index}`
          }))
        }
      ]
    },
    accountStrategy: {
      accounts: [{ id: "ai", displayName: "AI", dailyPostLimit: 10, cooldownHours: 6 }]
    }
  });

  assert.equal(calendar.summary.targetPosts, 10);
  assert.equal(calendar.summary.sameDayCapacity, 3);
  assert.equal(calendar.summary.capacityGap, 7);
  assert.equal(calendar.accountCalendars[0].status, "target_incompatible");
  assert.equal(calendar.scalePlan.status, "not_ready_to_scale");
  assert.equal(calendar.scalePlan.theoreticalMaxTodayPosts, 3);
  assert.equal(calendar.scalePlan.recommendedTargetPerAccountIfKeepCooldown, 3);
  assert.equal(calendar.scalePlan.recommendedCooldownHoursForTarget, 1.5);
  assert.equal(calendar.scalePlan.blockers.includes("cooldown_capacity"), true);
});

test("product roadmap identifies non-auth product blockers", () => {
  const roadmap = buildProductRoadmap({
    date: "2026-06-12",
    latest: {
      summary: { affiliateQueueCount: 3 },
      draftPlan: { summary: { targetPosts: 200, plannedPosts: 30 } },
      supplyPlan: { qualifiedTools: 30 },
      sourceQualityQueue: { summary: { totalNeededCandidates: 40 } },
      source: { breakdown: { enabledExtraSources: 2, sourceCandidateTools: 20, candidateInboxTools: 0 } },
      freshnessReport: { stats: { topPickFreshPostCandidates: 1 } },
      warnings: [],
      accountStrategy: { summary: { activeAccounts: 20 } }
    },
    contentCalendar: {
      summary: { targetPosts: 200, scheduledPosts: 30, capacityGap: 100, draftGap: 170 },
      accountCalendars: []
    },
    feedback: { entries: [] },
    queues: { items: [] },
    affiliateResearch: { items: [] },
    accountPosts: { items: [] },
    affiliateLinks: { links: [] },
    sourceImportPack: { summary: { totalRows: 100, rowsNeedingResearch: 100 } },
    affiliateWorkbench: { summary: { candidates: 2, readyToConfigure: 0 } },
    publicDemoReady: true
  });

  assert.equal(roadmap.level, "prototype");
  assert.match(roadmap.gapRadar.headline, /not X account switching/);
  assert.equal(roadmap.summary.nonAuthBlockers > 0, true);
  assert.equal(roadmap.gapRadar.now.items.some((item) => item.id === "content_supply"), true);
  assert.equal(roadmap.gapRadar.now.items.some((item) => item.id === "feedback_loop"), true);
  assert.equal(roadmap.gapRadar.deferred.items.some((item) => item.id === "account_switching"), true);
  assert.equal(roadmap.dimensions.find((item) => item.id === "account_switching").status, "deferred");
  assert.equal(roadmap.topBlockers.some((item) => item.id === "content_supply"), true);
  assert.equal(roadmap.topBlockers.some((item) => item.id === "content_calendar"), true);
  assert.match(roadmap.dimensions.find((item) => item.id === "content_supply").evidence.join(" "), /100 source-pack rows/);
  assert.match(roadmap.dimensions.find((item) => item.id === "affiliate_monetization").evidence.join(" "), /2 candidates in affiliate research workbench/);
  assert.equal(roadmap.dimensions.find((item) => item.id === "public_product").score, 82);
});

test("scale readiness blocks volume when feedback and supply are missing", () => {
  const report = buildScaleReadiness({
    date: "2026-06-12",
    latest: {
      freshnessReport: { stats: { topPickFreshPostCandidates: 2 } },
      draftPlan: { summary: { targetPosts: 20, plannedPosts: 4 } },
      sourceQualityQueue: { summary: { totalNeededCandidates: 16 } },
      accountStrategy: { authReady: false, mode: "manual_confirm" }
    },
    feedbackOps: {
      summary: { pending: 1, measured: 0, learningScore: 0 },
      debtGate: { maxNewPostsBeforeMetrics: 0 }
    },
    accountConfig: {
      rotationPolicy: { defaultDailyPostLimit: 10 },
      accounts: [
        { id: "a", displayName: "A", active: true, dailyPostLimit: 10 },
        { id: "b", displayName: "B", active: true, dailyPostLimit: 10 }
      ]
    },
    contentCalendar: { summary: { targetPosts: 20, scheduledPosts: 4 } },
    sourceImportPack: { summary: { totalRows: 100, rowsNeedingResearch: 90 } },
    accountContentMatrix: {
      summary: {
        readyAccounts: 0,
        candidateBenchTarget: 60,
        matchedCandidates: 5,
        strongCandidates: 2,
        freshCandidates: 1,
        draftGap: 16,
        candidateGap: 55
      },
      priorityAccounts: [{ displayName: "A" }]
    }
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.target.targetDailyPosts, 20);
  assert.equal(report.capacity.safeNewPosts, 0);
  assert.equal(report.scaleReality.realisticDailyPosts, 0);
  assert.equal(report.scaleReality.gapToTarget, 20);
  assert.equal(report.scaleReality.bottleneck.id, "feedback_gate");
  assert.equal(report.capacity.accountMatrixReadyAccounts, 0);
  assert.equal(report.capacity.accountMatrixCandidateBench, 5);
  assert.equal(report.blockers.some((item) => item.id === "feedback_missing"), true);
  assert.equal(report.blockers.some((item) => item.id === "account_matrix_gap"), true);
  assert.equal(report.blockers.some((item) => item.id === "source_gap"), true);
  assert.match(report.actionPlan.join(" "), /账号矩阵/);
  assert.match(report.actionPlan.join(" "), /不要按 20 账号目标硬放量/);
});

test("account content matrix exposes account-level candidate and draft gaps", () => {
  const aiTool = seedTool({ id: "ai_agent_tool", accountId: "ai", score: 30 });
  const aiSecond = seedTool({ id: "ai_workflow_tool", accountId: "ai", score: 26 });
  const saasTool = seedTool({ id: "saas_pricing_tool", accountId: "saas", score: 28 });
  const saasSeed = { ...seedTool({ id: "seed_saas_tool", accountId: "", score: 26 }), accountId: "saas", accountName: "SaaS" };
  const matrix = buildAccountContentMatrix({
    date: "2026-06-12",
    latest: {
      tools: [aiTool, aiSecond, saasTool, saasSeed],
      freshnessReport: {
        publishableTools: [
          { name: aiTool.name, url: aiTool.url },
          { name: saasTool.name, url: saasTool.url }
        ]
      }
    },
    accountConfig: {
      rotationPolicy: { defaultDailyPostLimit: 2 },
      accounts: [
        { id: "ai", displayName: "AI", category: "AI", active: true, dailyPostLimit: 2 },
        { id: "saas", displayName: "SaaS", category: "SaaS", active: true, dailyPostLimit: 2 }
      ]
    },
    draftPlan: {
      accountPlans: [
        { accountId: "ai", plannedPosts: 1, drafts: [{ toolId: aiTool.toolId }] },
        { accountId: "saas", plannedPosts: 0, drafts: [] }
      ]
    },
    contentCalendar: {
      accountCalendars: [
        { accountId: "ai", scheduledPosts: 1, slots: [{}] },
        { accountId: "saas", scheduledPosts: 0, slots: [] }
      ]
    },
    feedbackOps: {
      accountStats: [
        { accountId: "ai", measured: 0, pending: 1 },
        { accountId: "saas", measured: 0, pending: 0 }
      ]
    }
  });
  const markdown = renderAccountContentMatrixMarkdown(matrix);

  assert.equal(matrix.summary.activeAccounts, 2);
  assert.equal(matrix.summary.targetDailyPosts, 4);
  assert.equal(matrix.summary.candidateBenchTarget, 12);
  assert.equal(matrix.summary.matchedCandidates, 4);
  assert.equal(matrix.summary.freshCandidates, 2);
  assert.equal(matrix.summary.plannedDrafts, 1);
  assert.equal(matrix.summary.scheduledPosts, 1);
  assert.equal(matrix.inventory.summary.postableToday, 1);
  assert.equal(matrix.inventory.summary.seedTestableAccounts, 1);
  assert.equal(matrix.inventory.summary.contentBlockedAccounts, 1);
  assert.equal(matrix.inventory.accounts.find((account) => account.accountId === "ai").status, "ready_to_seed");
  assert.equal(matrix.inventory.accounts.find((account) => account.accountId === "saas").status, "needs_drafts");
  assert.equal(matrix.inventory.accounts.find((account) => account.accountId === "saas").refillTemplate.rows.length, 3);
  assert.equal(matrix.priorityAccounts[0].accountId, "saas");
  assert.equal(matrix.searchTasks.length > 0, true);
  assert.equal(matrix.searchTasks.every((task) => task.url.startsWith("https://")), true);
  assert.match(markdown, /Account Inventory/);
  assert.match(markdown, /Account Content Matrix/);
});

test("account refill CSV template preserves account routing and skips blank rows", () => {
  const template = buildAccountRefillTemplate({
    date: "2026-06-12",
    refillNeed: 10,
    firstBottleneck: "drafts",
    status: "needs_drafts",
    account: {
      id: "ai",
      displayName: "AI Founder Signals",
      category: "AI startup circle"
    }
  });
  const csv = accountRefillRowsToCsv(template.rows);
  const blank = parseCandidatePaste(csv);
  const filledLines = csv.split("\n");
  const firstRow = filledLines[1].split(",");
  firstRow[3] = "Demo Monitor";
  firstRow[4] = "https://demo.example.com";
  firstRow[5] = "AI founders catch demo bugs before launch";
  filledLines[1] = firstRow.join(",");
  const filledCsv = filledLines.join("\n");
  const filled = parseCandidatePaste(filledCsv);

  assert.equal(template.rows.length, 10);
  assert.match(csv, /account_refill/);
  assert.equal(blank.entries.length, 0);
  assert.equal(filled.entries.length, 1);
  assert.equal(filled.entries[0].accountId, "ai");
  assert.equal(filled.entries[0].accountName, "AI Founder Signals");
  assert.equal(filled.entries[0].circle, "ai_startups");
});

test("account refill workbench ranks refill accounts with search links and CSV", () => {
  const matrix = {
    date: "2026-06-12",
    summary: { activeAccounts: 2, targetDailyPosts: 20, readyAccounts: 0 },
    inventory: {
      summary: {
        postableToday: 1,
        contentBlockedAccounts: 1,
        feedbackBlockedAccounts: 2
      },
      accounts: [
        {
          accountId: "ai",
          displayName: "AI Founder Signals",
          category: "AI startup circle",
          status: "ready_to_seed",
          statusLabel: "可手动种子测试",
          actionLabel: "手动测 1 条",
          actionDetail: "Post one manually reviewed test.",
          actionPriority: 101,
          readinessScore: 30,
          targetPosts: 10,
          postableToday: 1,
          refillNeed: 3,
          firstBottleneck: "drafts",
          bottlenecks: [{ id: "drafts", label: "Draft gap", missing: 3 }],
          refillTemplate: buildAccountRefillTemplate({
            date: "2026-06-12",
            refillNeed: 3,
            firstBottleneck: "drafts",
            status: "ready_to_seed",
            account: { id: "ai", displayName: "AI Founder Signals", category: "AI startup circle" }
          })
        },
        {
          accountId: "saas",
          displayName: "SaaS Pricing Lab",
          category: "SaaS founder circle",
          status: "needs_drafts",
          statusLabel: "缺草稿/排期",
          actionLabel: "补 8 条草稿/排期",
          actionDetail: "Needs unique copy.",
          actionPriority: 78,
          readinessScore: 10,
          targetPosts: 10,
          postableToday: 0,
          refillNeed: 8,
          firstBottleneck: "drafts",
          bottlenecks: [{ id: "drafts", label: "Draft gap", missing: 8 }],
          refillTemplate: buildAccountRefillTemplate({
            date: "2026-06-12",
            refillNeed: 8,
            firstBottleneck: "drafts",
            status: "needs_drafts",
            account: { id: "saas", displayName: "SaaS Pricing Lab", category: "SaaS founder circle" }
          })
        }
      ]
    }
  };
  const workbench = buildAccountRefillWorkbench({ date: "2026-06-12", accountContentMatrix: matrix, focusLimit: 2 });
  const markdown = renderAccountRefillWorkbenchMarkdown(workbench);

  assert.equal(workbench.status, "needs_refill");
  assert.equal(workbench.summary.focusAccounts, 2);
  assert.equal(workbench.summary.totalRefillNeed, 11);
  assert.equal(workbench.focusAccounts[0].accountId, "ai");
  assert.equal(workbench.focusAccounts[0].searchUrls.every((url) => url.startsWith("https://")), true);
  assert.match(workbench.focusAccounts[0].csv, /accountId,accountName,priority,name,url,tagline/);
  assert.match(workbench.focusAccounts[0].csv, /AI Founder Signals/);
  assert.match(markdown, /Account Refill Workbench/);
  assert.match(markdown, /Fill only real/);
});

test("account refill impact projects account gap movement from pasted rows", () => {
  const workbench = {
    accounts: [
      { accountId: "ai", displayName: "AI Founder Signals", category: "AI", refillNeed: 3, firstBottleneck: "drafts" },
      { accountId: "saas", displayName: "SaaS Pricing Lab", category: "SaaS", refillNeed: 2, firstBottleneck: "freshness" }
    ]
  };
  const previews = [
    { accountId: "ai", candidate: { accountId: "ai" }, importDecision: "import" },
    { accountId: "ai", candidate: { accountId: "ai" }, importDecision: "import" },
    { accountId: "ai", candidate: { accountId: "ai" }, importDecision: "review" },
    { accountId: "saas", candidate: { accountId: "saas" }, importDecision: "skip" }
  ];
  const recommended = buildAccountRefillImpact({ accountRefillWorkbench: workbench, previews, importMode: "recommended" });
  const all = buildAccountRefillImpact({ accountRefillWorkbench: workbench, previews, importMode: "all" });
  const noAccountRows = buildAccountRefillImpact({
    accountRefillWorkbench: workbench,
    previews: [{ candidate: {}, importDecision: "import" }]
  });

  assert.equal(recommended.summary.accountsTouched, 2);
  assert.equal(recommended.summary.acceptedCandidates, 2);
  assert.equal(recommended.accounts.find((account) => account.accountId === "ai").projectedRefillNeedAfter, 1);
  assert.equal(recommended.accounts.find((account) => account.accountId === "ai").status, "improved");
  assert.equal(recommended.accounts.find((account) => account.accountId === "saas").status, "not_moved");
  assert.equal(all.accounts.find((account) => account.accountId === "ai").status, "covered");
  assert.equal(noAccountRows.status, "no_account_rows");
});

test("scale ramp plan turns account matrix gaps into launch batches", () => {
  const plan = buildScaleRampPlan({
    date: "2026-06-12",
    accountContentMatrix: {
      summary: { activeAccounts: 4, targetDailyPosts: 40, plannedDrafts: 7, readyAccounts: 0 },
      accountRows: [
        { accountId: "ai", displayName: "AI", category: "AI", targetPosts: 10, candidateBenchTarget: 30, matchedCandidates: 12, strongCandidates: 4, freshCandidates: 4, plannedDrafts: 4, scheduledPosts: 2, measuredFeedback: 0, readinessScore: 35, status: "draft_short", blockers: ["drafts"] },
        { accountId: "saas", displayName: "SaaS", category: "SaaS", targetPosts: 10, candidateBenchTarget: 30, matchedCandidates: 8, strongCandidates: 2, freshCandidates: 2, plannedDrafts: 3, scheduledPosts: 1, measuredFeedback: 0, readinessScore: 25, status: "draft_short", blockers: ["freshness"] },
        { accountId: "crypto", displayName: "Crypto", category: "Crypto", targetPosts: 10, candidateBenchTarget: 30, matchedCandidates: 0, strongCandidates: 0, freshCandidates: 0, plannedDrafts: 0, scheduledPosts: 0, measuredFeedback: 0, readinessScore: 0, status: "draft_short", blockers: ["candidate_bench"] },
        { accountId: "indie", displayName: "Indie", category: "Indie", targetPosts: 10, candidateBenchTarget: 30, matchedCandidates: 3, strongCandidates: 1, freshCandidates: 1, plannedDrafts: 0, scheduledPosts: 0, measuredFeedback: 0, readinessScore: 10, status: "draft_short", blockers: ["drafts"] }
      ],
      searchTasks: [
        { accountId: "ai", provider: "X live search", query: "ai tools", url: "https://x.com/search?q=ai", targetRows: 3 }
      ]
    },
    scaleReadiness: { blockers: [{ id: "feedback_missing" }] }
  });

  assert.equal(plan.summary.safeTestPosts, 3);
  assert.equal(plan.startAccounts.length, 3);
  assert.equal(plan.startAccounts[0].accountId, "ai");
  assert.equal(plan.startAccounts[0].searchTasks.length, 1);
  assert.equal(plan.nextAccounts.length, 1);
  assert.equal(plan.holdAccounts.length, 0);
  assert.equal(plan.operatingRules.some((rule) => rule.includes("manual review")), true);
});

test("seed batch pack creates account-specific research rows", () => {
  const pack = buildSeedBatchPack({
    date: "2026-06-12",
    rowsPerAccount: 2,
    csvPath: "output/seed.csv",
    guidePath: "output/seed.md",
    scaleRampPlan: {
      summary: { safeTestPosts: 3 },
      startAccounts: [
        {
          accountId: "ai",
          displayName: "AI Tools",
          category: "AI tools",
          launchStage: "seed_this_week",
          readinessScore: 20,
          missing: { drafts: 8, fresh: 5 },
          searchTasks: [{ provider: "X live search", query: "ai tools", url: "https://x.com/search?q=ai" }]
        },
        {
          accountId: "crypto",
          displayName: "Crypto Builder",
          category: "Crypto builder circle",
          launchStage: "seed_this_week",
          readinessScore: 10,
          missing: { drafts: 10, fresh: 8 },
          searchTasks: []
        }
      ]
    }
  });
  const csv = seedBatchRowsToCsv(pack.rows);

  assert.equal(pack.summary.accounts, 2);
  assert.equal(pack.summary.rows, 4);
  assert.equal(pack.rows[0].accountId, "ai");
  assert.equal(pack.rows.some((row) => row.circle === "crypto_builders"), true);
  assert.match(csv, /accountId,accountName/);
  assert.match(csv, /https:\/\/x\.com\/search/);
});

test("content ops plan caps publishing and points to refill tasks", () => {
  const plan = buildContentOpsPlan({
    date: "2026-06-13",
    latest: {
      sourceDiscovery: {
        circles: [
          {
            circleId: "indie_hackers",
            circleName: "Indie hacker circle",
            searchLinks: [
              { label: "X live search", query: "\"micro SaaS\" launch", url: "https://x.com/search?q=micro%20saas" }
            ]
          }
        ]
      },
      sourceQualityQueue: {
        summary: { totalNeededCandidates: 42 },
        items: [
          {
            circleId: "indie_hackers",
            circleName: "Indie hacker circle",
            neededCandidates: 12,
            currentQualifiedTools: 3,
            searchQueries: ["\"micro SaaS\" launch"],
            importHint: "Add indie candidates."
          }
        ]
      }
    },
    scaleReadiness: {
      target: { targetDailyPosts: 200 },
      capacity: {
        safeNewPosts: 3,
        freshPublishCandidates: 4,
        feedbackMeasured: 0,
        feedbackPending: 0,
        sourceGap: 42
      }
    },
    accountRefillWorkbench: {
      summary: { postableToday: 2 },
      focusAccounts: [
        {
          accountId: "indie_launch_radar",
          displayName: "Indie Launch Radar",
          status: "needs_drafts",
          statusLabel: "缺草稿",
          refillNeed: 9,
          postableToday: 2,
          targetPosts: 10,
          firstBottleneck: "drafts",
          searchUrls: ["https://x.com/search?q=micro%20saas"],
          csv: "accountId,name,url\nindie_launch_radar,,"
        }
      ]
    }
  });

  assert.equal(plan.summary.targetDailyPosts, 200);
  assert.equal(plan.summary.recommendedPostLimit, 2);
  assert.equal(plan.status, "seed_then_measure");
  assert.equal(plan.accountTasks[0].rowsToCollect, 9);
  assert.equal(plan.circleTasks[0].circleId, "indie_hackers");
  assert.equal(plan.circleTasks[0].searchUrls[0], "https://x.com/search?q=micro%20saas");
  assert.match(plan.circleTasks[0].csv, /name,url,tagline,source,circle,candidateType/);
  assert.match(plan.circleTasks[0].csv, /indie_hackers_research/);
  assert.match(plan.checklist[0].title, /seed posts/);
});

test("seed import readiness shows account launch signal from preview rows", () => {
  const seedBatchPack = {
    rowsByAccount: [
      { accountId: "ai", displayName: "AI Tools", missingDrafts: 10 },
      { accountId: "crypto", displayName: "Crypto Builder", missingDrafts: 10 }
    ]
  };
  const readiness = buildSeedImportReadiness({
    seedBatchPack,
    previews: [
      { candidate: { accountId: "ai" }, importDecision: "import" },
      { candidate: { accountId: "ai" }, importDecision: "import" },
      { candidate: { accountId: "ai" }, importDecision: "import" },
      { candidate: { accountId: "crypto" }, importDecision: "review" },
      { candidate: { accountId: "crypto" }, importDecision: "review" },
      { candidate: { accountId: "crypto" }, importDecision: "review" }
    ]
  });

  assert.equal(readiness.summary.ready, 1);
  assert.equal(readiness.summary.review, 1);
  assert.equal(readiness.accounts[0].status, "ready_to_seed");
  assert.equal(readiness.accounts[1].status, "needs_review");
});

test("seed import next actions guide the manual follow-up", () => {
  const actions = buildSeedImportNextActions({
    imported: 3,
    skipped: 1,
    importMode: "recommended",
    seedImportReadiness: {
      summary: { parsed: 4 },
      accounts: [
        { displayName: "AI Tools", status: "ready_to_seed", remaining: 0 },
        { displayName: "Crypto Builder", status: "not_ready", remaining: 2 }
      ]
    }
  });

  assert.deepEqual(actions.map((action) => action.type), [
    "refresh_daily",
    "open_final_review",
    "continue_seed_pack",
    "check_skipped_rows"
  ]);
  assert.equal(actions[0].tone, "good");
});

test("non-seed import next actions do not show seed account gaps", () => {
  const actions = buildSeedImportNextActions({
    imported: 0,
    skipped: 1,
    importMode: "recommended",
    seedImportReadiness: {
      summary: { parsed: 0 },
      accounts: [
        { displayName: "AI Tools", status: "not_ready", remaining: 3, parsed: 0 }
      ]
    }
  });

  assert.deepEqual(actions.map((action) => action.type), [
    "fix_candidates",
    "check_skipped_rows"
  ]);
});

test("affiliate research workbench prioritizes candidates and ready snippets", () => {
  const workbench = buildAffiliateResearchWorkbench({
    date: "2026-06-12",
    latest: {
      affiliateResearchQueue: [
        {
          name: "Partner Tool",
          url: "https://partner.example.com",
          affiliateScore: 8,
          score: 42,
          followUpAction: "affiliate priority",
          reason: "No affiliate link yet — research needed"
        }
      ],
      tools: []
    },
    affiliateResearch: {
      items: [
        {
          toolName: "Approved Missing",
          toolUrl: "https://missing.example.com",
          status: "approved",
          programUrl: "https://missing.example.com/partners"
        },
        {
          toolName: "Ready Tool",
          toolUrl: "https://ready.example.com",
          status: "approved",
          programUrl: "https://ready.example.com/partners",
          affiliateLink: "https://ready.example.com/?ref=real"
        }
      ]
    },
    affiliateLinks: { links: [] },
    queues: { items: [] }
  });

  assert.equal(workbench.summary.candidates, 1);
  assert.equal(workbench.priorityQueue[0].name, "Partner Tool");
  assert.equal(workbench.records.find((item) => item.toolName === "Approved Missing").readiness.state, "missing");
  assert.equal(workbench.readyConfigSnippets.length, 1);
  assert.match(workbench.readyConfigSnippets[0].snippet, /ready.example.com/);
  assert.equal(affiliateSearchLinks("Partner Tool", "https://partner.example.com").some((link) => link.label === "PartnerStack"), true);
  assert.equal(affiliateSearchLinks("News Tool", "https://techcrunch.com/story")[0].label, "source article");
  assert.equal(affiliateSearchLinks("News Tool", "https://techcrunch.com/story")[1].url.includes("site%3Atechcrunch.com"), false);
});

test("placeholder affiliate links do not count as configured", () => {
  const affiliateLinks = {
    links: [
      {
        match: "example-tool",
        domains: ["example.com"],
        affiliateUrl: "https://example.com/?ref=your-id",
        note: "Replace with your real affiliate link."
      },
      {
        match: "Real Tool",
        domains: ["realtool.com"],
        affiliateUrl: "https://realtool.com/?ref=actual"
      }
    ]
  };

  assert.equal(realAffiliateLinks(affiliateLinks).length, 1);
  assert.equal(affiliateLinkMatchesTool({ name: "example-tool", url: "https://example.com" }, affiliateLinks.links[0]), false);
  assert.equal(affiliateLinkMatchesTool({ name: "Real Tool", url: "https://realtool.com" }, affiliateLinks.links[1]), true);
});

test("buildDecisionReport recommends review page for strong bookmarks", () => {
  const latest = {
    tools: [
      {
        toolId: "tool_1",
        name: "Tool",
        url: "https://tool.com",
        scoreBreakdown: { affiliateScore: 7 },
        copyVariants: { shortPost: "Short copy" }
      }
    ]
  };
  const feedback = {
    entries: [
      {
        toolId: "tool_1",
        toolName: "Tool",
        toolUrl: "https://tool.com",
        variantType: "shortPost",
        engagementScore: 30,
        metrics: { impressions: 500, likes: 5, bookmarks: 4, replies: 1, reposts: 0, clicks: 2, profileVisits: 1 }
      }
    ]
  };
  const report = buildDecisionReport({ latest, history: { tools: [] }, feedback, queues: { items: [] } });
  assert.equal(report.summary.recommendations > 0, true);
  assert.equal(report.recommendations.some((item) => item.queueType === "review_page"), true);
  assert.equal(report.summary.topAngle, "shortPost");
});

test("promotion suggestions do not recommend posting stale seen-before tools without feedback", () => {
  const latest = {
    generatedAt: "2026-06-08T00:00:00.000Z",
    tools: [
      {
        toolId: "tool_1",
        name: "Old Tool",
        url: "https://tool.com",
        tagline: "Old workflow tool",
        published: "2026-06-01T00:00:00.000Z",
        seenBefore: true,
        followUpAction: "tweet only",
        scoreBreakdown: { affiliateScore: 2, riskScore: 1 }
      }
    ]
  };
  const suggestions = buildPromotionSuggestions({
    latest,
    history: { tools: [{ toolId: "tool_1", date: "2026-06-07" }] },
    feedback: { entries: [] },
    affiliateLinks: { links: [] }
  });

  assert.equal(suggestions[0].suggestion, "watch");
});

test("promotion review maps suggestions into manual queue actions", () => {
  const latest = {
    date: "2026-06-12",
    generatedAt: "2026-06-12T12:00:00.000Z",
    tools: [
      {
        toolId: "tool_affiliate",
        name: "Affiliate Tool",
        url: "https://affiliate.example.com",
        tagline: "Pricing workflow for SaaS teams",
        published: "2026-06-12T00:00:00.000Z",
        score: 30,
        scoreBreakdown: { affiliateScore: 8, riskScore: 1 },
        followUpAction: "affiliate priority"
      }
    ]
  };
  const review = buildPromotionReviewQueue({
    latest,
    history: { tools: [] },
    feedback: { entries: [] },
    queues: { items: [] },
    affiliateLinks: { links: [] }
  });

  assert.equal(review.summary.readyToQueue, 1);
  assert.equal(review.items[0].queueType, "affiliate_research");
  assert.equal(review.items[0].reviewStatus, "ready_to_queue");
  assert.match(review.nextActions[0], /Affiliate Tool/);
});

test("promotion review does not duplicate active queue items", () => {
  const latest = {
    date: "2026-06-12",
    generatedAt: "2026-06-12T12:00:00.000Z",
    tools: [
      {
        toolId: "tool_thread",
        name: "Thread Tool",
        url: "https://thread.example.com",
        tagline: "A workflow note",
        published: "2026-06-12T00:00:00.000Z",
        score: 28,
        scoreBreakdown: { affiliateScore: 2, riskScore: 1 },
        followUpAction: "thread candidate"
      }
    ]
  };
  const review = buildPromotionReviewQueue({
    latest,
    history: { tools: [] },
    feedback: { entries: [] },
    queues: { items: [{ toolId: "tool_thread", type: "thread", status: "new" }] },
    affiliateLinks: { links: [] }
  });

  assert.equal(review.summary.alreadyQueued, 1);
  assert.equal(review.items[0].reviewStatus, "already_queued");
  assert.equal(review.items[0].alreadyQueued, true);
});

test("x publish payload requires text under 280 chars", () => {
  assert.deepEqual(buildXPostPayload(" hello "), { text: "hello" });
  assert.throws(() => buildXPostPayload(""), /Post text is required/);
  assert.throws(() => buildXPostPayload("x".repeat(281)), /280/);
});

test("x publish status does not expose token", () => {
  const status = getXPublishStatus({ X_ACCESS_TOKEN: "secret" });
  assert.equal(status.configured, true);
  assert.equal(JSON.stringify(status).includes("secret"), false);
});

test("x account token status uses account-scoped env keys", () => {
  const prefix = accountEnvPrefix("ai_tools_lab");
  const updates = accountEnvUpdates("ai_tools_lab", {
    X_ACCESS_TOKEN: "secret",
    X_REFRESH_TOKEN: "refresh-secret",
    X_TOKEN_TYPE: "bearer",
    X_ACCESS_TOKEN_EXPIRES_AT: "2026-06-12T00:30:00.000Z"
  });
  const status = getAccountXPublishStatus("ai_tools_lab", {
    X_CLIENT_ID: "client",
    ...updates
  }, new Date("2026-06-12T00:00:00.000Z"));

  assert.equal(prefix, "X_ACCOUNT_AI_TOOLS_LAB_");
  assert.equal(status.configured, true);
  assert.equal(status.accountId, "ai_tools_lab");
  assert.equal(JSON.stringify(status).includes("secret"), false);
});

test("x account status can use global token fallback for the selected account", async () => {
  const env = {
    X_ACCESS_TOKEN: "global-secret",
    X_TOKEN_TYPE: "bearer"
  };
  const status = getAccountXPublishStatus("ai_tools_lab", env, new Date("2026-06-12T00:00:00.000Z"), {
    useGlobalFallback: true
  });
  const token = await resolveXAccessToken(env, "ai_tools_lab", { useGlobalTokenFallback: true });

  assert.equal(status.configured, true);
  assert.equal(status.publishReady, true);
  assert.equal(status.usesGlobalToken, true);
  assert.equal(status.accountId, "ai_tools_lab");
  assert.equal(JSON.stringify(status).includes("global-secret"), false);
  assert.equal(token, "global-secret");
});

test("x publish status reports expired refreshable token", () => {
  const status = getXPublishStatus({
    X_ACCESS_TOKEN: "secret",
    X_REFRESH_TOKEN: "refresh-secret-value",
    X_ACCESS_TOKEN_EXPIRES_AT: "2026-06-07T00:00:00.000Z"
  }, new Date("2026-06-07T00:10:00.000Z"));

  assert.equal(status.configured, true);
  assert.equal(status.publishReady, true);
  assert.equal(status.expired, true);
  assert.equal(status.health, "expired_refresh_ready");
  assert.equal(JSON.stringify(status).includes("secret"), false);
  assert.equal(JSON.stringify(status).includes("refresh-secret-value"), false);
});

test("x token refresh check uses refresh token and expiry", () => {
  const now = new Date("2026-06-07T00:00:00.000Z");
  assert.equal(shouldRefreshXToken({ X_REFRESH_TOKEN: "r", X_ACCESS_TOKEN_EXPIRES_AT: "2026-06-07T00:01:00.000Z" }, now), true);
  assert.equal(shouldRefreshXToken({ X_REFRESH_TOKEN: "r", X_ACCESS_TOKEN_EXPIRES_AT: "2026-06-07T00:30:00.000Z" }, now), false);
  assert.equal(shouldRefreshXToken({ X_ACCESS_TOKEN_EXPIRES_AT: "2026-06-07T00:01:00.000Z" }, now), false);
});

test("dotenv helper parses and updates local env text", () => {
  assert.deepEqual(parseDotEnv('X_CLIENT_ID="abc"\n# skip\nX_AUTH_PORT=8787\n'), {
    X_CLIENT_ID: "abc",
    X_AUTH_PORT: "8787"
  });
  const merged = mergeDotEnvText("X_CLIENT_ID=\"old\"\nKEEP=\"yes\"\n", {
    X_CLIENT_ID: "new",
    X_ACCESS_TOKEN: "token"
  });
  assert.match(merged, /X_CLIENT_ID="new"/);
  assert.match(merged, /KEEP="yes"/);
  assert.match(merged, /X_ACCESS_TOKEN="token"/);
});
