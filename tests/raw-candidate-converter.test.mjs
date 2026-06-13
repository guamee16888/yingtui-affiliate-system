import test from "node:test";
import assert from "node:assert/strict";
import { emptyCollection } from "../scripts/lib/core-data.mjs";
import { buildRawCandidateConversion } from "../scripts/lib/raw-candidate-converter.mjs";
import { buildRawCandidate } from "../scripts/lib/source-lanes.mjs";

function emptyCore() {
  return {
    tools: emptyCollection(),
    topics: emptyCollection(),
    copyLibrary: emptyCollection(),
    postTasks: emptyCollection(),
    postLedger: emptyCollection(),
    xAccounts: {
      version: 1,
      updatedAt: "",
      items: [
        { accountId: "saas_growth_ops", status: "active", niche: "SaaS founders", persona: "SaaS Growth Ops", dailyPostLimit: 10, externalLinkLimit: 1, managerUserId: "manager_1" },
        { accountId: "crypto_builder_radar", status: "active", niche: "Crypto builders", persona: "Crypto Builder Radar", dailyPostLimit: 10, externalLinkLimit: 1, managerUserId: "manager_1" }
      ]
    },
    assignments: { version: 1, updatedAt: "", items: [{ accountId: "saas_growth_ops", userId: "staff_1", active: true }] },
    users: { version: 1, updatedAt: "", items: [{ userId: "staff_1", active: true }] },
    accountHealth: emptyCollection(),
    contentRules: { rules: {} }
  };
}

function sourceData(rawCandidates, enabledLaneIds = ["saas_founders"]) {
  return {
    workspaces: {
      version: 1,
      updatedAt: "",
      items: [{
        workspaceId: "workspace_saas",
        name: "SaaS Workspace",
        enabledLaneIds,
        staffUserIds: ["staff_1"],
        managerUserIds: ["manager_1"],
        active: true
      }]
    },
    workspaceLanes: {
      version: 1,
      updatedAt: "",
      items: enabledLaneIds.map((laneId, index) => ({ workspaceId: "workspace_saas", laneId, enabled: true, priority: index + 1 }))
    },
    rawCandidates: { version: 1, updatedAt: "", items: rawCandidates },
    contentLanes: emptyCollection(),
    sourceConnectors: emptyCollection(),
    sourceFeeds: emptyCollection(),
    sourceRuns: emptyCollection(),
    manualCandidates: emptyCollection()
  };
}

test("raw candidate conversion creates tool topic copy and task for enabled workspace lane", () => {
  const raw = buildRawCandidate({
    title: "SaaS onboarding churn teardown",
    url: "https://real-saas.example/teardown",
    summary: "Pricing onboarding churn and PLG lessons for B2B SaaS founders.",
    laneIds: ["saas_founders"],
    connectorId: "manual"
  }, { now: "2026-06-13T00:00:00.000Z" });
  const result = buildRawCandidateConversion({
    sourceData: sourceData([raw]),
    core: emptyCore(),
    workspaceId: "workspace_saas",
    date: "2026-06-13",
    now: "2026-06-13T01:00:00.000Z"
  });

  assert.equal(result.stats.toolsAdded, 1);
  assert.equal(result.stats.topicsAdded, 1);
  assert.equal(result.stats.copiesAdded, 1);
  assert.equal(result.stats.tasksAdded, 1);
  assert.equal(result.core.postTasks.items[0].workspaceId, "workspace_saas");
  assert.equal(result.core.postTasks.items[0].laneId, "saas_founders");
  assert.equal(result.core.postTasks.items[0].accountId, "saas_growth_ops");
  assert.equal(result.core.postTasks.items[0].assignedTo, "staff_1");
  assert.equal(result.core.copyLibrary.items[0].linkPolicy, "no_link");
  assert.equal(result.core.copyLibrary.items[0].weightedCharCount <= 280, true);
  assert.equal(result.sourceData.rawCandidates.items[0].status, "converted_to_topic");
});

test("raw candidate conversion respects workspace enabled lanes", () => {
  const raw = buildRawCandidate({
    title: "Wallet security dashboard",
    url: "https://wallet-security.example/dashboard",
    summary: "Crypto wallet UX security and onchain data workflow for builders.",
    laneIds: ["crypto_builders"]
  });
  const result = buildRawCandidateConversion({
    sourceData: sourceData([raw], ["saas_founders"]),
    core: emptyCore(),
    workspaceId: "workspace_saas"
  });

  assert.equal(result.stats.skippedNoWorkspaceLane, 1);
  assert.equal(result.stats.tasksAdded, 0);
  assert.equal(result.core.tools.items.length, 0);
});

test("raw candidate conversion is idempotent for already converted candidates", () => {
  const raw = buildRawCandidate({
    title: "SaaS pricing teardown",
    url: "https://real-saas.example/pricing",
    summary: "Pricing onboarding churn and sales lessons for SaaS founders.",
    laneIds: ["saas_founders"]
  });
  const first = buildRawCandidateConversion({
    sourceData: sourceData([raw]),
    core: emptyCore(),
    workspaceId: "workspace_saas",
    date: "2026-06-13"
  });
  const second = buildRawCandidateConversion({
    sourceData: first.sourceData,
    core: first.core,
    workspaceId: "workspace_saas",
    date: "2026-06-13"
  });

  assert.equal(second.stats.toolsAdded, 0);
  assert.equal(second.stats.skippedExistingTask, 1);
  assert.equal(second.core.postTasks.items.length, 1);
});

test("raw candidate conversion skips blocked crypto risk candidates", () => {
  const raw = buildRawCandidate({
    title: "Crypto price prediction signal dashboard",
    url: "https://crypto-risk.example/signal",
    summary: "Price prediction signal and financial advice for token trades.",
    laneIds: ["crypto_builders"]
  });
  const result = buildRawCandidateConversion({
    sourceData: sourceData([raw], ["crypto_builders"]),
    core: emptyCore(),
    workspaceId: "workspace_saas"
  });

  assert.equal(result.stats.skippedRisk, 1);
  assert.equal(result.stats.tasksAdded, 0);
});

test("raw candidate conversion skips placeholder example.com candidates", () => {
  const raw = buildRawCandidate({
    title: "Template candidate",
    url: "https://example.com/template",
    summary: "SaaS pricing onboarding churn.",
    laneIds: ["saas_founders"]
  });
  const result = buildRawCandidateConversion({
    sourceData: sourceData([raw]),
    core: emptyCore(),
    workspaceId: "workspace_saas"
  });

  assert.equal(result.stats.skippedPlaceholder, 1);
  assert.equal(result.stats.tasksAdded, 0);
});
