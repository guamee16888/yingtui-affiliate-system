import test from "node:test";
import assert from "node:assert/strict";
import { buildPostTasks } from "../scripts/publish/generate-post-tasks.mjs";

test("task generation creates one pending review task and stays idempotent", () => {
  const base = {
    date: "2026-06-13",
    latestTools: [{
      toolId: "tool_a",
      name: "Tool A",
      url: "https://toola.com",
      accountRecommendation: { primary: { accountId: "ai_tools_lab" } }
    }],
    tools: [{ toolId: "tool_a", name: "Tool A", officialUrl: "https://toola.com" }],
    topics: [{ topicId: "topic_a", toolId: "tool_a", painPoint: "manual work" }],
    copyLibrary: [{ copyId: "copy_a", topicId: "topic_a", toolId: "tool_a", variantType: "shortPost", copyText: "Testing Tool A https://toola.com", status: "approved" }],
    existingTasks: [],
    ledger: [],
    xAccounts: [{ accountId: "ai_tools_lab", status: "active", dailyPostLimit: 3, externalLinkLimit: 2 }],
    assignments: [{ accountId: "ai_tools_lab", userId: "user_owner", active: true }],
    users: [{ userId: "user_owner" }],
    accountHealth: [],
    contentRules: { rules: {} }
  };
  const first = buildPostTasks(base);
  assert.equal(first.tasks.length, 1);
  assert.equal(first.tasks[0].status, "pending_review");
  assert.equal(first.tasks[0].approvalStatus, "pending");

  const second = buildPostTasks({ ...base, existingTasks: first.tasks });
  assert.equal(second.tasks.length, 1);
  assert.equal(second.stats.skippedExisting, 1);
});
