import assert from "node:assert/strict";
import test from "node:test";
import { calculateAccountHealth } from "../scripts/lib/account-health-engine.mjs";

test("account health never returns NaN for missing metrics", () => {
  const result = calculateAccountHealth({
    account: { accountId: "acc_a", status: "active" },
    tasks: [{ accountId: "acc_a", status: "feedback_due", metrics: {} }],
    ledger: [],
    feedback: []
  });
  assert.equal(Number.isNaN(result.healthScore), false);
  assert.equal(result.riskFlags.includes("feedback_debt"), true);
});

test("feedback debt lowers health score", () => {
  const clean = calculateAccountHealth({
    account: { accountId: "acc_a", status: "active" },
    tasks: [],
    ledger: [{ accountId: "acc_a", postedAt: new Date().toISOString(), externalLinks: [] }],
    feedback: [{ accountId: "acc_a", metrics: { impressions: 100 } }]
  });
  const debt = calculateAccountHealth({
    account: { accountId: "acc_a", status: "active" },
    tasks: [
      { accountId: "acc_a", status: "feedback_due", metrics: {} },
      { accountId: "acc_a", status: "posted", metrics: {} }
    ],
    ledger: [],
    feedback: []
  });
  assert.ok(debt.healthScore < clean.healthScore);
});

test("external links lower account health", () => {
  const result = calculateAccountHealth({
    account: { accountId: "acc_a", status: "active", externalLinkLimit: 1 },
    tasks: [],
    ledger: [
      { accountId: "acc_a", externalLinks: ["https://a.example"] },
      { accountId: "acc_a", externalLinks: ["https://b.example"] },
      { accountId: "acc_a", externalLinks: ["https://c.example"] }
    ],
    feedback: []
  });
  assert.equal(result.riskFlags.includes("external_link_ratio_high"), true);
  assert.ok(result.healthScore < 72);
});

test("paused and restricted accounts map to paused/risky", () => {
  assert.equal(calculateAccountHealth({ account: { accountId: "acc_a", status: "paused" } }).healthStatus, "paused");
  assert.equal(calculateAccountHealth({ account: { accountId: "acc_a", status: "restricted" } }).healthStatus, "risky");
});
