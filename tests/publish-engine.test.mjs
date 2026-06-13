import test from "node:test";
import assert from "node:assert/strict";
import { emptyCollection } from "../scripts/lib/core-data.mjs";
import { buildPublishJobs, executePublishJobs, evaluatePublishJobs } from "../scripts/lib/publish-engine.mjs";

const now = new Date("2026-06-13T08:00:00.000Z");
const settings = {
  settings: {
    globalAutoPublishEnabled: true,
    dryRunByDefault: true,
    requireApprovalBeforePublish: true,
    maxPostsPerAccountPerDay: 3,
    maxExternalLinksPerAccountPerDay: 1,
    maxSameToolPerDayGlobal: 3,
    maxSameDomainPerDayGlobal: 5,
    maxAffiliateLinksPerDayGlobal: 3,
    allowedPublishModes: ["manual", "scheduled", "auto"],
    defaultPublishMode: "manual"
  }
};

const workspace = { workspaceId: "workspace_default", enabledLaneIds: ["ai_startups"], publishMode: "auto", autoPublishEnabled: true, managerUserIds: ["manager_1"], staffUserIds: ["staff_1"], active: true };
const account = { accountId: "acc_1", status: "active", publishMode: "auto", autoPublishEnabled: true, dailyPostLimit: 3, externalLinkLimit: 1 };
const connection = { connectionId: "xconn_1", accountId: "acc_1", workspaceId: "workspace_default", handle: "@example", status: "connected", tokenRef: "server_side_only" };

function task(overrides = {}) {
  return {
    taskId: overrides.taskId || "task_1",
    date: "2026-06-13",
    workspaceId: "workspace_default",
    laneId: "ai_startups",
    accountId: "acc_1",
    assignedTo: "staff_1",
    toolId: "tool_1",
    topicId: "topic_1",
    copyId: "copy_1",
    copyText: "A specific AI workflow note worth testing today.",
    status: overrides.status || "assigned",
    approvalStatus: overrides.approvalStatus || "approved",
    publishMode: overrides.publishMode || "auto",
    autoPublishEnabled: true,
    externalLinks: [],
    metrics: {}
  };
}

function data(overrides = {}) {
  const currentTask = overrides.task || task();
  return {
    workspaces: { ...emptyCollection(), items: [workspace] },
    users: { ...emptyCollection(), items: [{ userId: "staff_1", role: "staff" }] },
    xAccounts: { ...emptyCollection(), items: [account] },
    assignments: emptyCollection(),
    copyLibrary: { ...emptyCollection(), items: [{ copyId: currentTask.copyId, copyText: currentTask.copyText }] },
    postTasks: { ...emptyCollection(), items: [currentTask] },
    postLedger: { ...emptyCollection(), items: overrides.ledger || [] },
    accountHealth: emptyCollection(),
    contentRules: { rules: { maxSameToolPerEmployeeDay: 2, maxSameDomainPerDayGlobal: 5, maxExternalLinksPerAccountDay: 1 } },
    publishSettings: overrides.publishSettings || settings,
    xConnections: { ...emptyCollection(), items: overrides.connections ?? [connection] },
    publishJobs: { ...emptyCollection(), items: overrides.jobs || [] },
    publishAttempts: { ...emptyCollection(), items: overrides.attempts || [] },
    publisher: overrides.publisher || (async () => ({ ok: true, xPostId: "123", postedUrl: "https://x.com/example/status/123" })),
    now
  };
}

test("prepare creates one publish job and stays idempotent", () => {
  const first = buildPublishJobs(data());
  assert.equal(first.summary.created, 1);
  assert.equal(first.jobs.length, 1);
  const second = buildPublishJobs({ ...data(), publishJobs: { ...emptyCollection(), items: first.jobs } });
  assert.equal(second.summary.created, 0);
  assert.equal(second.jobs.length, 1);
});

test("dry-run marks ready without writing ledger", () => {
  const prepared = buildPublishJobs(data());
  const result = evaluatePublishJobs({ ...data({ jobs: prepared.jobs }), live: false, now });
  assert.equal(result.summary.ready, 1);
  assert.equal(data().postLedger.items.length, 0);
});

test("live publish success writes ledger and marks task feedback_due", async () => {
  const prepared = buildPublishJobs(data());
  const result = await executePublishJobs({ ...data({ jobs: prepared.jobs }), live: true, actorRole: "admin", now });
  assert.equal(result.summary.posted, 1);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].taskId, "task_1");
  assert.equal(result.tasks[0].status, "feedback_due");
  assert.equal(result.attempts.at(-1).status, "success");
});

test("same task cannot live publish twice when ledger exists", async () => {
  const prepared = buildPublishJobs(data());
  const ledger = [{ taskId: "task_1", accountId: "acc_1", toolId: "tool_1", postedAt: "2026-06-13T07:00:00.000Z", normalizedTextHash: "old" }];
  const result = await executePublishJobs({ ...data({ jobs: prepared.jobs, ledger }), live: true, actorRole: "admin", now });
  assert.equal(result.summary.blocked, 1);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.attempts.at(-1).status, "blocked");
});

test("staff role cannot run live publish", async () => {
  const prepared = buildPublishJobs(data());
  await assert.rejects(
    () => executePublishJobs({ ...data({ jobs: prepared.jobs }), live: true, actorRole: "staff", now }),
    /Only manager\/admin/
  );
});
