import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePublishSafety } from "../scripts/lib/publish-safety.mjs";

const settings = {
  globalAutoPublishEnabled: true,
  dryRunByDefault: true,
  requireApprovalBeforePublish: true,
  maxPostsPerAccountPerDay: 2,
  maxExternalLinksPerAccountPerDay: 1,
  maxSameToolPerDayGlobal: 3,
  maxSameDomainPerDayGlobal: 5,
  maxAffiliateLinksPerDayGlobal: 1,
  allowedPublishModes: ["manual", "scheduled", "auto"],
  defaultPublishMode: "manual"
};

const account = { accountId: "acc_1", status: "active", dailyPostLimit: 2, externalLinkLimit: 1, publishMode: "auto", autoPublishEnabled: true };
const workspace = { workspaceId: "workspace_default", enabledLaneIds: ["ai_startups"], publishMode: "auto", autoPublishEnabled: true };
const connection = { accountId: "acc_1", status: "connected", handle: "@example", tokenRef: "server_side_only" };

function task(overrides = {}) {
  return {
    taskId: overrides.taskId || "task_1",
    date: "2026-06-13",
    workspaceId: "workspace_default",
    laneId: "ai_startups",
    accountId: overrides.accountId || "acc_1",
    assignedTo: "staff_1",
    toolId: overrides.toolId || "tool_1",
    topicId: "topic_1",
    copyId: overrides.copyId || "copy_1",
    copyText: overrides.copyText || "A specific AI workflow note worth testing today.",
    status: overrides.status || "assigned",
    approvalStatus: overrides.approvalStatus || "approved",
    publishMode: overrides.publishMode || "auto",
    autoPublishEnabled: overrides.autoPublishEnabled ?? true,
    externalLinks: overrides.externalLinks || [],
    affiliateLinkUsed: overrides.affiliateLinkUsed || "",
    duplicateCheckResult: { riskLevel: "low", flags: [] }
  };
}

function safety(overrides = {}) {
  const currentTask = overrides.task || task(overrides.taskOverrides);
  return evaluatePublishSafety({
    task: currentTask,
    account: overrides.account ?? account,
    workspace: overrides.workspace ?? workspace,
    connection: Object.hasOwn(overrides, "connection") ? overrides.connection : connection,
    settings: overrides.settings ?? settings,
    tasks: overrides.tasks ?? [currentTask],
    ledger: overrides.ledger ?? [],
    xAccounts: overrides.xAccounts ?? [overrides.account ?? account],
    users: [{ userId: "staff_1", role: "staff" }],
    accountHealth: [],
    copyLibrary: overrides.copyLibrary ?? [{ copyId: currentTask.copyId, copyText: currentTask.copyText }],
    contentRules: { rules: { maxSameToolPerEmployeeDay: 2, maxSameDomainPerDayGlobal: 5, maxExternalLinksPerAccountDay: 1 } },
    now: new Date("2026-06-13T08:00:00.000Z"),
    live: overrides.live ?? false
  });
}

test("missing X connection blocks publishing", () => {
  const result = safety({ connection: null });
  assert.equal(result.canPublish, false);
  assert.equal(result.flags.some((item) => item.type === "x_not_connected"), true);
});

test("task must be approved before publish", () => {
  const result = safety({ taskOverrides: { approvalStatus: "pending", status: "pending_review" } });
  assert.equal(result.canPublish, false);
  assert.equal(result.flags.some((item) => item.type === "task_not_approved"), true);
});

test("over 280 weighted characters blocks publish", () => {
  const result = safety({ taskOverrides: { copyText: "a".repeat(281) } });
  assert.equal(result.canPublish, false);
  assert.equal(result.flags.some((item) => item.type === "tweet_over_280"), true);
});

test("duplicate checker block prevents publish", () => {
  const current = task();
  const result = safety({
    task: current,
    ledger: [{ taskId: "old", normalizedTextHash: "", postedText: current.copyText }]
  });
  assert.equal(result.canPublish, false);
  assert.equal(result.flags.some((item) => item.type === "copy_duplicate"), true);
});

test("paused account cannot publish", () => {
  const result = safety({ account: { ...account, status: "paused" }, xAccounts: [{ ...account, status: "paused" }] });
  assert.equal(result.canPublish, false);
  assert.equal(result.flags.some((item) => item.type === "account_not_active"), true);
});

test("live publish requires global auto enabled", () => {
  const result = safety({
    live: true,
    settings: { ...settings, globalAutoPublishEnabled: false }
  });
  assert.equal(result.canPublish, false);
  assert.equal(result.flags.some((item) => item.type === "global_auto_disabled" || item.type === "live_publish_disabled"), true);
});

test("same affiliate link daily limit blocks publish", () => {
  const result = safety({
    taskOverrides: { affiliateLinkUsed: "https://tool.com/?ref=real" },
    ledger: [{ accountId: "acc_2", postedAt: "2026-06-13T01:00:00.000Z", affiliateLinkUsed: "https://tool.com/?ref=real" }]
  });
  assert.equal(result.canPublish, false);
  assert.equal(result.flags.some((item) => item.type === "affiliate_global_limit"), true);
});
