import test from "node:test";
import assert from "node:assert/strict";
import { emptyCollection } from "../scripts/lib/core-data.mjs";
import {
  buildManualCandidateIngest,
  buildLaneSummary,
  buildSourceLaneSeed,
  candidateRiskFlags,
  classifyCandidateLanes
} from "../scripts/lib/source-lanes.mjs";

function emptyLaneData() {
  return {
    workspaces: emptyCollection(),
    contentLanes: emptyCollection(),
    sourceConnectors: emptyCollection(),
    sourceFeeds: emptyCollection(),
    rawCandidates: emptyCollection(),
    sourceRuns: emptyCollection(),
    workspaceLanes: emptyCollection(),
    manualCandidates: emptyCollection()
  };
}

test("source lane seed creates four lanes and is idempotent", () => {
  const first = buildSourceLaneSeed(emptyLaneData());
  const second = buildSourceLaneSeed(first.next);

  assert.equal(first.next.contentLanes.items.length, 4);
  assert.equal(first.next.workspaces.items.length, 1);
  assert.equal(first.next.sourceConnectors.items.some((item) => item.connectorId === "manual"), true);
  assert.equal(second.next.contentLanes.items.length, 4);
  assert.equal(second.next.workspaceLanes.items.length, first.next.workspaceLanes.items.length);
});

test("default workspace subscribes to content lanes instead of owning source connectors", () => {
  const seeded = buildSourceLaneSeed(emptyLaneData()).next;
  const workspace = seeded.workspaces.items.find((item) => item.workspaceId === "workspace_default");
  const summary = buildLaneSummary(seeded);

  assert.deepEqual(workspace.enabledLaneIds, ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"]);
  assert.equal(summary.workspaceStats[0].enabledLaneCount, 4);
  assert.equal(summary.summary.connectorsWithoutLane, 0);
});

test("candidate classifier maps common founder topics to lanes", () => {
  assert.deepEqual(
    classifyCandidateLanes({ title: "SaaS pricing onboarding churn teardown", summary: "PLG sales founder ops" }),
    ["saas_founders"]
  );
  assert.deepEqual(
    classifyCandidateLanes({ title: "Solo founder build in public launch workflow" }),
    ["indie_builders"]
  );
  assert.deepEqual(
    classifyCandidateLanes({ title: "AI agent workflow automation for support teams" }),
    ["ai_startups"]
  );
});

test("manual candidate ingest skips duplicate URL or title", () => {
  const seeded = buildSourceLaneSeed(emptyLaneData()).next;
  const manualCandidates = {
    version: 1,
    updatedAt: "",
    items: [
      { title: "SaaS pricing teardown", url: "https://saas.test/saas-pricing", summary: "pricing onboarding churn" },
      { title: "SaaS pricing teardown", url: "https://saas.test/other", summary: "pricing onboarding churn" },
      { title: "Different title", url: "https://saas.test/saas-pricing?utm_source=x", summary: "pricing sales" }
    ]
  };
  const result = buildManualCandidateIngest({ ...seeded, manualCandidates });

  assert.equal(result.imported.length, 1);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.sourceRuns.items.length, 1);
  assert.equal(result.rawCandidates.items.length, 1);
  assert.deepEqual(result.rawCandidates.items[0].laneIds, ["saas_founders"]);
  assert.equal(result.rawCandidates.items[0].feedId, "feed_saas_manual");
});

test("crypto lane marks blocked price and signal topics", () => {
  const flags = candidateRiskFlags({
    title: "Crypto wallet signal",
    summary: "financial advice and price prediction for token traders",
    laneIds: ["crypto_builders"]
  }, ["crypto_builders"]);

  assert.equal(flags.some((flag) => flag.type === "crypto_blocked_topic" && flag.severity === "block"), true);
});

test("lane summary reports feeds, raw candidates, and candidates without lane", () => {
  const seeded = buildSourceLaneSeed(emptyLaneData()).next;
  const rawCandidates = {
    version: 1,
    updatedAt: "",
    items: [
      { candidateId: "candidate_saas", laneIds: ["saas_founders"] },
      { candidateId: "candidate_none", laneIds: [] }
    ]
  };
  const summary = buildLaneSummary({ ...seeded, rawCandidates });

  assert.equal(summary.summary.contentLanes, 4);
  assert.equal(summary.laneStats.find((lane) => lane.laneId === "saas_founders").sourceFeeds, 1);
  assert.equal(summary.laneStats.find((lane) => lane.laneId === "saas_founders").rawCandidates, 1);
  assert.equal(summary.summary.candidatesWithoutLane, 1);
  assert.deepEqual(summary.candidatesWithoutLane, ["candidate_none"]);
});
