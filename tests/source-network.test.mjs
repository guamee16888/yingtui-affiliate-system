import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSourceNetworkConfigWithSource,
  buildSourceNetworkReportsFromData,
  normalizeSourceNetworkConfig
} from "../scripts/lib/source-network.mjs";
import { buildSupplyGapFiller } from "../scripts/lib/supply-gap-filler.mjs";
import { emptyCollection } from "../scripts/lib/core-data.mjs";

const config = JSON.parse(await readFile(new URL("../config/source-network.json", import.meta.url), "utf8"));

test("source network defines 100-account AI x Crypto lane model", () => {
  const normalized = normalizeSourceNetworkConfig(config);

  assert.equal(normalized.target.accounts, 100);
  assert.equal(normalized.target.inventoryPerAccount, 10);
  assert.equal(normalized.target.requiredInventory, 1000);
  assert.deepEqual(normalized.lanes.map((lane) => lane.laneId), [
    "ai_builder",
    "ai_saas",
    "ai_agent",
    "crypto_builder",
    "crypto_alpha"
  ]);
  assert.equal(normalized.lanes.reduce((sum, lane) => sum + lane.accountTarget, 0), 100);
});

test("source registry keeps L2 community sources manual-review only", () => {
  const reports = buildSourceNetworkReportsFromData({
    date: "2026-06-20",
    config,
    sourceCandidates: { items: [] },
    rawCandidates: emptyCollection(),
    sourceRuns: emptyCollection(),
    copyLibrary: emptyCollection(),
    postTasks: emptyCollection()
  });

  assert.equal(reports.registry.summary.l0Premium, 5);
  assert.equal(reports.registry.summary.l1Public, 8);
  assert.equal(reports.registry.summary.l2Community, 3);
  const l2 = reports.registry.sources.filter((source) => source.tier === "L2");
  assert.equal(l2.every((source) => source.canDirectlyGenerateTasks === false), true);
  assert.equal(l2.every((source) => source.reviewPolicy === "manual_review_only"), true);
});

test("source network can add a new source through editable config", () => {
  const next = buildSourceNetworkConfigWithSource(config, {
    name: "AI Founder RSS",
    url: "https://example.com/ai-founders.xml",
    tier: "L1",
    status: "active",
    laneIds: ["ai_saas", "ai_builder"],
    qualityScore: 81,
    freshnessScore: 77,
    notes: "Founder and SaaS signal."
  });
  const source = next.sources.find((item) => item.sourceId === "ai_founder_rss");

  assert.equal(source.name, "AI Founder RSS");
  assert.equal(source.status, "active");
  assert.deepEqual(source.laneIds, ["ai_saas", "ai_builder"]);
  assert.equal(source.reviewPolicy, "direct_candidate");
});

test("supply report calculates 1000 inventory gap and lane shortages", () => {
  const reports = buildSourceNetworkReportsFromData({
    date: "2026-06-20",
    config,
    sourceCandidates: {
      items: [
        { id: "c1", source: "product_hunt", circle: "ai_saas", name: "AI SaaS Launch", url: "https://ph.test/1", status: "active" },
        { id: "c2", source: "reddit_watch", circle: "crypto_alpha", name: "Noisy community watch", url: "https://reddit.test/1", status: "active" }
      ]
    },
    rawCandidates: {
      version: 1,
      items: [
        { candidateId: "r1", sourceId: "kaito_ai_crypto", laneIds: ["ai_agent"], title: "Agent narrative", url: "https://kaito.test/1", status: "new" }
      ]
    },
    sourceRuns: emptyCollection(),
    copyLibrary: { version: 1, items: [{ copyId: "copy_1", laneIds: ["ai_saas"], status: "ready" }] },
    postTasks: { version: 1, items: [{ taskId: "task_1", laneIds: ["ai_saas"], status: "approved" }] }
  });

  assert.equal(reports.supply.summary.requiredInventory, 1000);
  assert.equal(reports.supply.summary.currentInventory, 1);
  assert.equal(reports.supply.summary.directCandidates, 2);
  assert.equal(reports.supply.summary.reviewOnlyCandidates, 1);
  assert.equal(reports.supply.summary.projectedInventory, 7);
  assert.equal(reports.supply.summary.inventoryGap, 999);
  assert.equal(reports.supply.lanes.find((lane) => lane.laneId === "ai_saas").requiredInventory, 200);
  assert.equal(reports.supply.lanes.find((lane) => lane.laneId === "crypto_alpha").projectedInventory, 0);
});

test("source network maps legacy lanes and HN feeds into AI x Crypto reporting", () => {
  const reports = buildSourceNetworkReportsFromData({
    date: "2026-06-20",
    config,
    sourceCandidates: {
      items: [
        { id: "legacy_ai_agent", source: "hn_ai_agent_search", circle: "ai_startups", name: "Agent workflow builder", url: "https://news.ycombinator.com/item?id=1", status: "active" },
        { id: "legacy_saas", source: "hn_saas_founders", circle: "saas_founders", name: "SaaS pricing lesson", url: "https://news.ycombinator.com/item?id=2", status: "active" },
        { id: "legacy_crypto_alpha", source: "hn_crypto_builders", circle: "crypto_builders", name: "Token market structure note", url: "https://news.ycombinator.com/item?id=3", status: "active" }
      ]
    },
    rawCandidates: emptyCollection(),
    sourceRuns: emptyCollection(),
    copyLibrary: emptyCollection(),
    postTasks: emptyCollection()
  });

  const hackerNews = reports.quality.sources.find((source) => source.sourceId === "hacker_news");
  assert.equal(hackerNews.candidateCount, 3);
  assert.equal(reports.quality.lanes.find((lane) => lane.laneId === "ai_agent").effectiveCandidates, 1);
  assert.equal(reports.quality.lanes.find((lane) => lane.laneId === "ai_saas").effectiveCandidates, 1);
  assert.equal(reports.quality.lanes.find((lane) => lane.laneId === "crypto_alpha").effectiveCandidates, 1);
  assert.equal(reports.supply.lanes.find((lane) => lane.laneId === "crypto_alpha").directCandidateCount, 1);
});

test("supply report can infer inventory lanes from topic and tool context", () => {
  const reports = buildSourceNetworkReportsFromData({
    date: "2026-06-20",
    config,
    sourceCandidates: { items: [] },
    rawCandidates: emptyCollection(),
    sourceRuns: emptyCollection(),
    tools: {
      version: 1,
      items: [
        {
          toolId: "tool_agent_workflow",
          name: "Agent workflow debugger",
          domain: "github.com",
          tagline: "Debug multi-agent automation and MCP tool calls"
        }
      ]
    },
    topics: {
      version: 1,
      items: [
        {
          topicId: "topic_agent_workflow",
          toolId: "tool_agent_workflow",
          audience: "AI operators",
          painPoint: "agent workflow breaks between tools"
        }
      ]
    },
    copyLibrary: { version: 1, items: [{ copyId: "copy_agent", topicId: "topic_agent_workflow", toolId: "tool_agent_workflow", status: "ready" }] },
    postTasks: { version: 1, items: [{ taskId: "task_agent", topicId: "topic_agent_workflow", toolId: "tool_agent_workflow", status: "approved" }] }
  });

  assert.equal(reports.supply.summary.currentInventory, 1);
  assert.equal(reports.supply.lanes.find((lane) => lane.laneId === "ai_agent").currentInventory, 1);
});

test("supply gap filler includes source network lane and premium-source actions", () => {
  const reports = buildSourceNetworkReportsFromData({
    date: "2026-06-20",
    config,
    sourceCandidates: { items: [] },
    rawCandidates: emptyCollection(),
    sourceRuns: emptyCollection(),
    copyLibrary: emptyCollection(),
    postTasks: emptyCollection()
  });
  const plan = buildSupplyGapFiller({
    date: "2026-06-20",
    sourceNetwork: reports
  });

  assert.equal(plan.status, "needs_supply");
  assert.equal(plan.summary.sourceNetworkRequiredInventory, 1000);
  assert.equal(plan.summary.sourceNetworkProjectedGap, 1000);
  assert.equal(plan.sourceNetwork.lanes[0].laneId, "ai_builder");
  assert.equal(plan.actionList.some((item) => item.type === "source_network_lane"), true);
  assert.equal(plan.actionList.some((item) => item.type === "premium_source_budget"), true);
});
