import test from "node:test";
import assert from "node:assert/strict";
import { emptyCollection, DEFAULT_CONTENT_RULES } from "../scripts/lib/core-data.mjs";
import { buildCoreMigration } from "../scripts/migrate-core-data.mjs";

function emptyCore() {
  return {
    users: emptyCollection(),
    xAccounts: emptyCollection(),
    assignments: emptyCollection(),
    tools: emptyCollection(),
    topics: emptyCollection(),
    copyLibrary: emptyCollection(),
    postTasks: emptyCollection(),
    postLedger: emptyCollection(),
    accountHealth: emptyCollection(),
    contentRules: DEFAULT_CONTENT_RULES
  };
}

function inputs() {
  return {
    latest: {
      date: "2026-06-13",
      tools: [{
        toolId: "tool_a",
        name: "Tool A",
        url: "https://toola.com",
        tagline: "Small SaaS workflow",
        score: 30,
        scoreBreakdown: { painScore: 8 },
        copyVariants: { shortPost: "Testing Tool A for one narrow workflow https://toola.com" }
      }]
    },
    dailySnapshots: [],
    history: { tools: [] },
    feedback: {
      entries: [{
        id: "feedback_1",
        toolId: "tool_a",
        toolName: "Tool A",
        toolUrl: "https://toola.com",
        sourceDate: "2026-06-13",
        variantType: "shortPost",
        accountId: "ai_tools_lab",
        copyText: "Testing Tool A for one narrow workflow https://toola.com",
        posted: true,
        postedUrl: "https://x.com/me/status/1",
        postedAt: "2026-06-13T01:00:00.000Z",
        metrics: {}
      }]
    },
    accountPosts: { items: [] },
    xAccountsConfig: {
      rotationPolicy: { defaultDailyPostLimit: 2 },
      accounts: [{ id: "ai_tools_lab", displayName: "AI Tools Lab", active: true, handle: "@ai_tools_lab" }]
    },
    affiliateLinks: { links: [] }
  };
}

test("migration is idempotent for tools and copy", () => {
  const first = buildCoreMigration({ core: emptyCore(), inputs: inputs() });
  assert.equal(first.next.tools.items.length, 1);
  assert.equal(first.next.copyLibrary.items.length, 1);
  assert.equal(first.next.postLedger.items.length, 1);
  assert.equal(first.feedback.entries[0].taskId.startsWith("task_"), true);

  const second = buildCoreMigration({ core: first.next, inputs: inputs() });
  assert.equal(second.next.tools.items.length, 1);
  assert.equal(second.next.copyLibrary.items.length, 1);
  assert.equal(second.next.postLedger.items.length, 1);
});
