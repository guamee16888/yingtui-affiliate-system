import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { emptyCollection } from "../scripts/lib/core-data.mjs";
import {
  buildOpenClawSourceRun,
  evaluateOpenClawCandidate,
  fetchOpenClawSource,
  normalizeOpenClawConfig
} from "../scripts/lib/openclaw-source-hunter.mjs";
import { buildOpenClawLaunchdPlist } from "../scripts/lib/openclaw-scheduler.mjs";

const defaultConfig = JSON.parse(await readFile(new URL("../config/openclaw-source-hunters.json", import.meta.url), "utf8"));

function sourceData(existingRawCandidates = []) {
  return {
    rawCandidates: { version: 1, updatedAt: "", items: existingRawCandidates },
    sourceRuns: emptyCollection(),
    contentLanes: emptyCollection()
  };
}

test("OpenClaw config defines AI Crypto and Founder hunters", () => {
  const config = normalizeOpenClawConfig(defaultConfig);

  assert.deepEqual(config.hunters.map((hunter) => hunter.hunterId), [
    "openclaw_ai_hunter",
    "openclaw_crypto_hunter",
    "openclaw_founder_hunter"
  ]);
  assert.equal(config.target.dailyMinCandidates, 50);
  assert.equal(config.target.dailyMaxCandidates, 200);
  assert.equal(config.llm.enabled, true);
  assert.equal(config.llm.provider, "zhipu");
  assert.equal(config.llm.model, "glm-4.7");
  assert.equal(config.hunters.every((hunter) => hunter.sources.some((source) => source.status === "active")), true);
  assert.equal(config.hunters.every((hunter) => hunter.judgeProfile.profileId), true);
});

test("OpenClaw filters scores and sends high quality candidates to raw candidates", async () => {
  const config = normalizeOpenClawConfig({
    target: { dailyMinCandidates: 1, dailyMaxCandidates: 20, minimumScore: 70 },
    hub: { connectorId: "openclaw", hubId: "openclaw_source_hub" },
    hunters: [{
      hunterId: "openclaw_ai_hunter",
      name: "AI Hunter",
      minimumScore: 70,
      laneIds: ["ai_startups"],
      keywords: ["ai", "agent", "workflow"],
      sources: [{
        sourceId: "openclaw_product_hunt_ai",
        sourceNetworkSourceId: "product_hunt",
        name: "Product Hunt AI",
        type: "rss",
        status: "active",
        url: "https://example.test/feed.xml",
        laneIds: ["ai_startups"],
        qualityScore: 84,
        freshnessScore: 90,
        maxItems: 10,
        includeKeywords: ["ai", "agent", "workflow"],
        excludeKeywords: ["casino"]
      }]
    }]
  });
  const result = await buildOpenClawSourceRun({
    config,
    sourceData: sourceData(),
    now: "2026-06-23T00:00:00.000Z",
    sourceItemsBySourceId: new Map([[
      "openclaw_product_hunt_ai",
      {
        items: [
          {
            title: "AI agent workflow debugger",
            url: "https://tools.example/agent-debugger",
            summary: "Developer tool for AI agent workflow automation and debugging.",
            publishedAt: "2026-06-22T12:00:00.000Z",
            metrics: { discussionScore: 80, controversyScore: 35 }
          },
          {
            title: "Casino AI giveaway",
            url: "https://noise.example/casino-ai",
            summary: "Casino giveaway with AI buzzwords.",
            publishedAt: "2026-06-22T12:00:00.000Z"
          },
          {
            title: "Generic launch post",
            url: "https://thin.example/post",
            summary: "No useful workflow angle.",
            publishedAt: "2026-06-22T12:00:00.000Z"
          }
        ]
      }
    ]])
  });

  assert.equal(result.stats.fetched, 3);
  assert.equal(result.stats.imported, 1);
  assert.equal(result.stats.rejected, 2);
  assert.equal(result.rawCandidates.items.length, 1);
  assert.equal(result.rawCandidates.items[0].connectorId, "openclaw");
  assert.equal(result.rawCandidates.items[0].sourceId, "product_hunt");
  assert.equal(result.rawCandidates.items[0].laneIds.includes("ai_startups"), true);
  assert.equal(result.rawCandidates.items[0].openClaw.hunterId, "openclaw_ai_hunter");
  assert.equal(result.sourceRuns.items[0].sourceId, "openclaw_source_hub");
  assert.equal(result.report.summary.dailyTargetStatus, "covered");
});

test("OpenClaw duplicate gate does not import existing URLs again", async () => {
  const config = normalizeOpenClawConfig({
    target: { dailyMinCandidates: 1, dailyMaxCandidates: 20, minimumScore: 70 },
    hunters: [{
      hunterId: "openclaw_founder_hunter",
      name: "Founder Hunter",
      minimumScore: 70,
      laneIds: ["saas_founders"],
      keywords: ["founder", "saas", "pricing"],
      sources: [{
        sourceId: "openclaw_hn_founder",
        sourceNetworkSourceId: "hacker_news",
        name: "HN Founder",
        type: "hn_algolia",
        status: "active",
        url: "https://example.test/hn",
        laneIds: ["saas_founders"],
        qualityScore: 80,
        freshnessScore: 80,
        includeKeywords: ["founder", "saas", "pricing"],
        excludeKeywords: []
      }]
    }]
  });
  const existing = {
    candidateId: "candidate_existing",
    title: "SaaS pricing teardown",
    url: "https://news.example/saas-pricing",
    summary: "Founder SaaS pricing workflow.",
    status: "new"
  };
  const result = await buildOpenClawSourceRun({
    config,
    sourceData: sourceData([existing]),
    now: "2026-06-23T00:00:00.000Z",
    sourceItemsBySourceId: new Map([[
      "openclaw_hn_founder",
      {
        items: [{
          title: "SaaS pricing teardown",
          url: "https://news.example/saas-pricing",
          summary: "Founder SaaS pricing growth workflow for onboarding and churn.",
          publishedAt: "2026-06-22T12:00:00.000Z",
          metrics: { discussionScore: 85, controversyScore: 40 }
        }]
      }
    ]])
  });

  assert.equal(result.stats.imported, 0);
  assert.equal(result.stats.duplicates, 1);
  assert.equal(result.rawCandidates.items.length, 1);
});

test("OpenClaw LLM judge can reject a rule-qualified candidate", async () => {
  const config = normalizeOpenClawConfig({
    target: { dailyMinCandidates: 1, dailyMaxCandidates: 20, minimumScore: 60 },
    hunters: [{
      hunterId: "openclaw_ai_hunter",
      name: "AI Hunter",
      minimumScore: 60,
      laneIds: ["ai_startups"],
      keywords: ["ai", "agent", "workflow"],
      judgeProfile: {
        profileId: "ai_signal_judge",
        acceptWhen: ["AI workflow"],
        rejectWhen: ["thin announcements"]
      },
      sources: [{
        sourceId: "openclaw_hn_ai",
        sourceNetworkSourceId: "hacker_news",
        name: "HN AI",
        type: "hn_algolia",
        status: "active",
        url: "https://example.test/hn",
        laneIds: ["ai_startups"],
        qualityScore: 90,
        freshnessScore: 90,
        includeKeywords: ["ai", "agent", "workflow"],
        excludeKeywords: []
      }]
    }]
  });
  const result = await buildOpenClawSourceRun({
    config,
    sourceData: sourceData(),
    now: "2026-06-23T00:00:00.000Z",
    sourceItemsBySourceId: new Map([[
      "openclaw_hn_ai",
      {
        items: [{
          title: "AI agent workflow launch",
          url: "https://tools.example/launch",
          summary: "AI agent workflow automation for builders.",
          publishedAt: "2026-06-22T12:00:00.000Z",
          metrics: { discussionScore: 85, controversyScore: 30 }
        }]
      }
    ]]),
    llmRuntime: {
      enabled: true,
      mode: "llm-judge",
      provider: "zhipu",
      model: "glm-4.7",
      config: { acceptScore: 65, maxJudgementsPerRun: 10 }
    },
    llmClient: async () => ({
      keep: false,
      score: 42,
      topicAngle: "信息太薄",
      contentAngle: "",
      accountDirection: "AI工具号",
      reasons: ["没有足够产品细节"],
      riskFlags: ["thin_signal"]
    })
  });

  assert.equal(result.stats.imported, 0);
  assert.equal(result.stats.rejected, 1);
  assert.equal(result.stats.llm.judged, 1);
  assert.equal(result.stats.llm.rejected, 1);
});

test("OpenClaw LLM judge stores account direction on accepted candidates", async () => {
  const config = normalizeOpenClawConfig({
    target: { dailyMinCandidates: 1, dailyMaxCandidates: 20, minimumScore: 60 },
    hunters: [{
      hunterId: "openclaw_crypto_hunter",
      name: "Crypto Hunter",
      minimumScore: 60,
      laneIds: ["crypto_builders"],
      keywords: ["wallet", "onchain", "protocol"],
      judgeProfile: { profileId: "crypto_signal_judge" },
      sources: [{
        sourceId: "openclaw_defillama",
        sourceNetworkSourceId: "defillama",
        name: "DefiLlama",
        type: "defillama_protocols",
        status: "active",
        url: "https://example.test/protocols",
        laneIds: ["crypto_builders"],
        qualityScore: 90,
        freshnessScore: 90,
        includeKeywords: ["wallet", "onchain", "protocol"],
        excludeKeywords: []
      }]
    }]
  });
  const result = await buildOpenClawSourceRun({
    config,
    sourceData: sourceData(),
    now: "2026-06-23T00:00:00.000Z",
    sourceItemsBySourceId: new Map([[
      "openclaw_defillama",
      {
        items: [{
          title: "Onchain wallet protocol",
          url: "https://crypto.example/wallet",
          summary: "Wallet protocol for onchain builders.",
          publishedAt: "2026-06-22T12:00:00.000Z",
          metrics: { discussionScore: 85, controversyScore: 20 }
        }]
      }
    ]]),
    llmRuntime: {
      enabled: true,
      mode: "llm-judge",
      provider: "zhipu",
      model: "glm-4.7",
      config: { acceptScore: 65, maxJudgementsPerRun: 10 }
    },
    llmClient: async () => ({
      keep: true,
      score: 81,
      topicAngle: "适合拆解钱包协议的 builder 价值",
      contentAngle: "从开发者工作流角度发",
      accountDirection: "Crypto builder号",
      reasons: ["链上工具属性清晰"],
      riskFlags: []
    })
  });

  assert.equal(result.stats.imported, 1);
  assert.equal(result.rawCandidates.items[0].accountDirection, "Crypto builder号");
  assert.equal(result.rawCandidates.items[0].openClaw.llm.accountDirection, "Crypto builder号");
  assert.equal(result.report.topCandidates[0].accountDirection, "Crypto builder号");
});

test("OpenClaw scoring rejects excluded crypto signal bait", () => {
  const evaluation = evaluateOpenClawCandidate({
    title: "100x token price prediction signal",
    url: "https://crypto.example/signal",
    summary: "Leverage signal for token trades.",
    rawText: "crypto token price prediction signal leverage",
    sourcePublishedAt: "2026-06-23T00:00:00.000Z"
  }, {
    now: "2026-06-23T01:00:00.000Z",
    hunter: { keywords: ["crypto", "wallet", "onchain"] },
    source: {
      qualityScore: 82,
      freshnessScore: 80,
      includeKeywords: ["crypto", "token"],
      excludeKeywords: ["price prediction", "signal", "leverage"]
    }
  });

  assert.equal(evaluation.status, "reject");
  assert.equal(evaluation.breakdown.penalty > 0, true);
  assert.equal(evaluation.reasons.some((reason) => reason.startsWith("excluded:")), true);
});

test("OpenClaw RSS fetcher normalizes feed items", async () => {
  const source = {
    type: "rss",
    url: "https://example.test/feed.xml"
  };
  const fetchImpl = async () => ({
    ok: true,
    text: async () => `<?xml version="1.0"?><rss><channel><item><title>AI workflow launch</title><link>https://example.test/ai</link><description>Agent workflow automation for founders.</description><pubDate>Tue, 23 Jun 2026 00:00:00 GMT</pubDate></item></channel></rss>`
  });
  const items = await fetchOpenClawSource(source, { fetchImpl });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "AI workflow launch");
  assert.equal(items[0].url, "https://example.test/ai");
});

test("OpenClaw DefiLlama fetcher skips centralized exchanges", async () => {
  const source = {
    type: "defillama_protocols",
    url: "https://example.test/protocols",
    maxItems: 10
  };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [
      {
        name: "Noise Exchange",
        category: "CEX",
        url: "https://exchange.example",
        tvl: 10000000000,
        chains: ["Ethereum"]
      },
      {
        name: "Builder Lend",
        category: "Lending",
        url: "https://builderlend.example",
        tvl: 1000000,
        chains: ["Base", "Ethereum"],
        description: "Onchain lending protocol for builders"
      }
    ]
  });

  const items = await fetchOpenClawSource(source, { fetchImpl, now: "2026-06-23T00:00:00.000Z" });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Builder Lend");
  assert.equal(items[0].summary.includes("Lending"), true);
  assert.equal(items[0].summary.includes("Base"), true);
});

test("OpenClaw scheduler plist points launchd at daily script", () => {
  const plist = buildOpenClawLaunchdPlist({
    projectRoot: "/tmp/AI Creator OS",
    nodePath: "/usr/local/bin/node",
    hour: 7,
    minute: 45
  });

  assert.match(plist, /com\.guamee\.openclaw\.daily/);
  assert.match(plist, /openclaw-daily\.mjs/);
  assert.match(plist, /<integer>7<\/integer>/);
  assert.match(plist, /<integer>45<\/integer>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /openclaw-daily\.out\.log/);
});
