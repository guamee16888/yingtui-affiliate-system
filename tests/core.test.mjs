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
import { buildDecisionReport } from "../scripts/lib/decision-engine.mjs";
import { buildPromotionSuggestions } from "../scripts/lib/promotion-engine.mjs";
import { accountEnvPrefix, accountEnvUpdates, buildXPostPayload, getAccountXPublishStatus, getXPublishStatus, shouldRefreshXToken } from "../scripts/lib/x-publish.mjs";
import { mergeDotEnvText, parseDotEnv } from "../scripts/lib/env.mjs";
import { buildDailyModel, candidateInboxToTools, mergeToolSources } from "../scripts/lib/affiliate-system.mjs";
import { buildAccountStrategy, recommendAccountForItem } from "../scripts/lib/account-system.mjs";
import { buildSourceImportPackRows, buildSourceQualityQueue, buildSupplyPlan, sourceCandidatesToTools } from "../scripts/lib/content-source-system.mjs";
import { buildDraftPlan } from "../scripts/lib/draft-planner.mjs";

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
        sourceName: "Source",
        circle: "saas_founders",
        candidateType: "topic",
        status: "active"
      }
    ]
  }, "2026-06-12");

  assert.equal(tools[0].sourceType, "source_feed");
  assert.equal(tools[0].circle, "saas_founders");
  assert.equal(tools[0].candidateType, "topic");
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

test("parseCandidatePaste handles one candidate per line", () => {
  const parsed = parseCandidatePaste("Tool Name | https://tool.example.com | Fixes one clear workflow");

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries[0].name, "Tool Name");
  assert.equal(parsed.entries[0].tagline, "Fixes one clear workflow");
});

test("review outline uses placeholder without affiliate link", () => {
  const markdown = buildReviewOutline({ name: "Tool", url: "https://tool.com", copyVariants: {} }, null);
  assert.match(markdown, /Affiliate link not available yet/);
});

test("readJson missing file returns fallback and writeJsonAtomic writes JSON", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yingtui-"));
  const file = path.join(dir, "test.json");
  assert.deepEqual(await readJson(file, { ok: true }), { ok: true });
  await writeJsonAtomic(file, { hello: "world" });
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { hello: "world" });
  await rm(dir, { recursive: true, force: true });
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
      name: "Fresh Weak Tool",
      url: "https://fresh.example.com",
      tagline: "A tiny personal helper",
      description: "A tiny personal helper.",
      published: "2026-06-08T00:00:00.000Z"
    }
  ];
  const model = buildDailyModel({
    date: "2026-06-08",
    feedSource: "test",
    usedFallback: false,
    tools,
    history: { tools: [{ date: "2026-06-07", toolName: "Old Better Tool", url: "https://old.example.com", score: 25 }] },
    affiliateConfig: { links: [] },
    voice: { style: { avoid: [], maxTweetCharacters: 260, allowEmoji: false } },
    limit: 1,
    warnings: []
  });

  assert.equal(model.freshnessReport.stats.freshToday, 1);
  assert.equal(model.freshnessReport.freshFeedWatchlist[0].name, "Fresh Weak Tool");
  assert.match(model.freshnessReport.diagnosis, /fresh tools/i);
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
