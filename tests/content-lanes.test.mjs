import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONTENT_LANES, buildSourceLaneSeed } from "../scripts/lib/source-lanes.mjs";
import { emptyCollection } from "../scripts/lib/core-data.mjs";

test("the four commercial content lanes are defined", () => {
  const ids = DEFAULT_CONTENT_LANES.map((lane) => lane.laneId).sort();
  assert.deepEqual(ids, ["ai_startups", "crypto_builders", "indie_builders", "saas_founders"].sort());
  assert.equal(DEFAULT_CONTENT_LANES.find((lane) => lane.laneId === "crypto_builders").blockedTopics.includes("financial advice"), true);
  assert.equal(DEFAULT_CONTENT_LANES.find((lane) => lane.laneId === "saas_founders").defaultStyle.includes("operator-first"), true);
});

test("seed keeps workspace lane subscriptions centralized", () => {
  const seeded = buildSourceLaneSeed({
    workspaces: emptyCollection(),
    contentLanes: emptyCollection(),
    sourceConnectors: emptyCollection(),
    sourceFeeds: emptyCollection(),
    rawCandidates: { version: 1, updatedAt: "", items: [{ candidateId: "candidate_seed", sourceId: "manual_seed", url: "https://example.com/seed" }] },
    sourceRuns: emptyCollection(),
    workspaceLanes: emptyCollection(),
    manualCandidates: emptyCollection()
  });

  assert.equal(seeded.next.contentLanes.items.length, 4);
  assert.equal(seeded.next.workspaceLanes.items.length, 4);
  assert.equal(seeded.stats.removedPlaceholderRawCandidates, 1);
});
