import assert from "node:assert/strict";
import test from "node:test";
import { mapJsonToD1Rows, rowsToSql } from "../scripts/lib/json-to-d1-mapper.mjs";

const source = {
  workspaces: {
    items: [
      {
        workspaceId: "workspace_a",
        name: "Workspace A",
        managerUserIds: ["user_manager"],
        staffUserIds: ["user_staff"]
      }
    ]
  },
  users: {
    items: [
      { userId: "user_manager", name: "Manager", role: "manager", workspaceId: "workspace_a" },
      { userId: "user_staff", name: "Staff", role: "staff", workspaceId: "workspace_a" }
    ]
  },
  xAccounts: {
    items: [
      { accountId: "account_ai", workspaceId: "workspace_a", persona: "AI builder", dailyPostLimit: 10 },
      { accountId: "account_missing_workspace", persona: "Needs workspace" }
    ]
  },
  assignments: { items: [] },
  contentLanes: { items: [{ laneId: "ai_startups", name: "AI Startups" }] },
  workspaceLanes: { items: [{ workspaceId: "workspace_a", laneId: "ai_startups" }] },
  sourceConnectors: { items: [] },
  sourceFeeds: { items: [] },
  rawCandidates: { items: [] },
  tools: { items: [{ toolId: "tool_1", name: "Small AI Tool", url: "https://tool.example" }] },
  topics: { items: [{ topicId: "topic_1", workspaceId: "workspace_a", toolId: "tool_1", angle: "pain-first" }] },
  copyLibrary: {
    items: [
      {
        copyId: "copy_1",
        workspaceId: "workspace_a",
        topicId: "topic_1",
        toolId: "tool_1",
        copyText: "This tiny AI tool fixes one boring workflow without pretending to be a platform."
      }
    ]
  },
  postTasks: {
    items: [
      {
        taskId: "task_1",
        workspaceId: "workspace_a",
        accountId: "account_ai",
        assignedTo: "user_staff",
        toolId: "tool_1",
        topicId: "topic_1",
        copyId: "copy_1",
        copyText: "This tiny AI tool fixes one boring workflow without pretending to be a platform."
      }
    ]
  },
  postLedger: {
    items: [
      {
        ledgerId: "ledger_1",
        workspaceId: "workspace_a",
        taskId: "task_1",
        accountId: "account_ai",
        postedText: "Posted text",
        postedUrl: "https://x.com/example/status/1"
      }
    ]
  },
  feedback: { entries: [{ id: "feedback_1", workspaceId: "workspace_a", taskId: "task_1", metrics: { likes: 2 } }] },
  publishSettings: { settings: { globalAutoPublishEnabled: false, dryRunByDefault: true } },
  xConnections: {
    items: [
      {
        connectionId: "conn_1",
        workspaceId: "workspace_a",
        accountId: "account_ai",
        tokenRef: "raw-token-like-value",
        scopes: ["tweet.write"]
      }
    ]
  },
  publishJobs: { items: [] },
  publishAttempts: { items: [] }
};

test("json-to-d1 mapper maps workspace, users, accounts, and post tasks", () => {
  const { rows, summary } = mapJsonToD1Rows(source, { now: "2026-06-13T00:00:00.000Z" });
  assert.equal(summary.counts.workspaces, 1);
  assert.equal(summary.counts.users, 2);
  assert.equal(summary.counts.accounts, 2);
  assert.equal(summary.counts.tasks, 1);
  assert.equal(rows.workspaces[0].workspace_id, "workspace_a");
  assert.equal(rows.users[0].user_id, "user_manager");
  assert.equal(rows.x_accounts[0].account_id, "account_ai");
  assert.equal(rows.post_tasks[0].task_id, "task_1");
});

test("json-to-d1 mapper reports missing workspace ids", () => {
  const { summary } = mapJsonToD1Rows(source, { now: "2026-06-13T00:00:00.000Z" });
  assert.equal(summary.missingWorkspaceIdCount, 1);
});

test("json-to-d1 export strips tokens and posted URLs", () => {
  const { rows } = mapJsonToD1Rows(source, { now: "2026-06-13T00:00:00.000Z" });
  const sql = rowsToSql(rows);
  assert.match(sql, /This export may contain real operational data/);
  assert.doesNotMatch(sql, /raw-token-like-value/);
  assert.doesNotMatch(sql, /https:\/\/x\.com\/example\/status\/1/);
  assert.match(sql, /server_side_only|token_ref/i);
});
