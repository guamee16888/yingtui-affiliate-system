import test from "node:test";
import assert from "node:assert/strict";
import { checkCandidateDuplicate } from "../scripts/lib/candidate-dedupe.mjs";
import { classifyCandidate } from "../scripts/lib/source-classifier.mjs";
import { buildManualCandidateIngest, buildSourceLaneSeed } from "../scripts/lib/source-lanes.mjs";
import { emptyCollection } from "../scripts/lib/core-data.mjs";

function emptyLaneData() {
  return buildSourceLaneSeed({
    workspaces: emptyCollection(),
    contentLanes: emptyCollection(),
    sourceConnectors: emptyCollection(),
    sourceFeeds: emptyCollection(),
    rawCandidates: emptyCollection(),
    sourceRuns: emptyCollection(),
    workspaceLanes: emptyCollection(),
    manualCandidates: emptyCollection()
  }).next;
}

test("source classifier maps lane-specific candidates", () => {
  assert.deepEqual(classifyCandidate({ title: "AI agent workflow automation" }).laneIds, ["ai_startups"]);
  assert.deepEqual(classifyCandidate({ title: "Solo founder build in public launch" }).laneIds, ["indie_builders"]);
  assert.deepEqual(classifyCandidate({ title: "SaaS pricing onboarding churn" }).laneIds, ["saas_founders"]);
  assert.deepEqual(classifyCandidate({ title: "Wallet security onchain dashboard" }).laneIds, ["crypto_builders"]);
});

test("crypto blocked language becomes a blocking risk flag", () => {
  const result = classifyCandidate({ title: "Crypto wallet signal", summary: "price prediction and financial advice" });
  assert.equal(result.laneIds.includes("crypto_builders"), true);
  assert.equal(result.riskFlags.some((flag) => flag.type === "crypto_blocked_topic" && flag.severity === "block"), true);
});

test("candidate dedupe blocks URL and title duplicates and warns on similar domain titles", () => {
  const existing = [{ candidateId: "candidate_old", title: "SaaS onboarding teardown", url: "https://saas.test/onboarding" }];
  assert.equal(checkCandidateDuplicate({ title: "New title", url: "https://saas.test/onboarding?utm_source=x" }, existing).ok, false);
  assert.equal(checkCandidateDuplicate({ title: "SaaS onboarding teardown", url: "https://other.test/path" }, existing).ok, false);
  const warning = checkCandidateDuplicate({ title: "SaaS onboarding teardown checklist", url: "https://saas.test/checklist" }, existing);
  assert.equal(warning.ok, true);
  assert.equal(warning.flags.some((flag) => flag.type === "same_domain_similar_title"), true);
});

test("manual candidate ingest writes source run and only raw candidates", () => {
  const data = emptyLaneData();
  data.manualCandidates = {
    version: 1,
    updatedAt: "",
    items: [
      { title: "AI workflow builder", url: "https://ai-tools.test/workflow", summary: "agent workflow automation", laneHints: ["ai_startups"] },
      { title: "AI workflow builder", url: "https://ai-tools.test/duplicate", summary: "agent workflow automation" },
      { title: "Crypto signal dashboard", url: "https://crypto-tools.test/signal", summary: "wallet security with price prediction signal", laneHints: ["crypto_builders"] }
    ]
  };
  const result = buildManualCandidateIngest(data);

  assert.equal(result.imported.length, 2);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.sourceRuns.items.length, 1);
  assert.equal(result.rawCandidates.items.some((item) => item.status === "rejected"), true);
  assert.equal(result.rawCandidates.items.some((item) => item.title === "Crypto signal dashboard" && item.riskFlags.length), true);
});
