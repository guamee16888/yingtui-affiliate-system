import assert from "node:assert/strict";
import test from "node:test";
import { buildD1CandidateProductionPlan, buildLocalCandidateRawRows } from "../scripts/lib/app-candidate-production.mjs";

function d1Fixture(overrides = {}) {
  return {
    workspaces: [{
      workspace_id: "workspace_client",
      name: "Client Workspace",
      status: "active"
    }],
    workspaceLanes: [
      { workspace_id: "workspace_client", lane_id: "ai_startups", enabled: 1, priority: 10 },
      { workspace_id: "workspace_client", lane_id: "indie_builders", enabled: 1, priority: 20 },
      { workspace_id: "workspace_client", lane_id: "saas_founders", enabled: 1, priority: 30 }
    ],
    workspaceMembers: [
      { workspace_id: "workspace_client", user_id: "manager_1", role: "manager", status: "active" }
    ],
    users: [
      { user_id: "manager_1", status: "active" }
    ],
    xAccounts: [
      { workspace_id: "workspace_client", account_id: "acct_01", persona: "Account 01", niche: "General", status: "active", daily_post_limit: 10, external_link_limit: 1, manager_user_id: "manager_1" },
      { workspace_id: "workspace_client", account_id: "acct_02", persona: "Account 02", niche: "General", status: "active", daily_post_limit: 10, external_link_limit: 1, manager_user_id: "manager_1" }
    ],
    assignments: [
      { workspace_id: "workspace_client", account_id: "acct_01", user_id: "manager_1", active: 1 },
      { workspace_id: "workspace_client", account_id: "acct_02", user_id: "manager_1", active: 1 }
    ],
    rawCandidates: [],
    tools: [],
    topics: [],
    copyLibrary: [],
    postTasks: [],
    postLedger: [],
    ...overrides
  };
}

test("buildLocalCandidateRawRows turns source candidates into workspace D1 raw rows", () => {
  const result = buildLocalCandidateRawRows({
    workspaceId: "workspace_client",
    now: "2026-06-14T00:00:00.000Z",
    sourceCandidates: [{
      id: "source_1",
      name: "Tiny launch teardown",
      url: "https://news.ycombinator.com/item?id=123",
      tagline: "A useful indie launch lesson for small SaaS builders.",
      circle: "indie_hackers",
      status: "active",
      published: "2026-06-14T00:00:00.000Z"
    }]
  });

  assert.equal(result.stats.rows, 1);
  assert.equal(result.rows[0].workspace_id, "workspace_client");
  assert.equal(result.rows[0].lane_id, "indie_builders");
  assert.equal(result.rows[0].status, "new");
});

test("D1 production plan creates raw candidate, tool, topic, copy, and post task SQL", () => {
  const local = buildLocalCandidateRawRows({
    workspaceId: "workspace_client",
    now: "2026-06-14T00:00:00.000Z",
    sourceCandidates: [{
      id: "source_1",
      name: "AI support workflow queue",
      url: "https://techcrunch.com/2026/06/14/ai-support-workflow-queue/",
      tagline: "AI support teams need fewer inboxes and better review queues.",
      circle: "ai_startups",
      status: "active"
    }]
  });

  const plan = buildD1CandidateProductionPlan({
    workspaceId: "workspace_client",
    date: "2026-06-14",
    now: "2026-06-14T01:00:00.000Z",
    limit: 5,
    importRows: local.rows,
    d1: d1Fixture()
  });

  assert.equal(plan.stats.importedRawCandidates, 1);
  assert.equal(plan.stats.toolsAdded, 1);
  assert.equal(plan.stats.topicsAdded, 1);
  assert.equal(plan.stats.copiesAdded, 1);
  assert.equal(plan.stats.tasksAdded, 1);
  assert.match(plan.sql, /INSERT OR IGNORE INTO raw_candidates/);
  assert.match(plan.sql, /INSERT OR IGNORE INTO tools/);
  assert.match(plan.sql, /INSERT OR IGNORE INTO topics/);
  assert.match(plan.sql, /INSERT OR IGNORE INTO copy_library/);
  assert.match(plan.sql, /INSERT OR IGNORE INTO post_tasks/);
  assert.match(plan.sql, /UPDATE raw_candidates SET status = 'converted_to_topic'/);
  assert.doesNotMatch(plan.sql, /posted_url|access_token|client_secret/i);
});

test("D1 production plan respects enabled workspace lanes and skips placeholders", () => {
  const local = buildLocalCandidateRawRows({
    workspaceId: "workspace_client",
    sourceCandidates: [
      {
        id: "source_good",
        name: "Wallet UX research",
        url: "https://github.com/topics/wallet-security",
        tagline: "Crypto wallet UX and security lesson for product builders.",
        circle: "crypto_builders",
        status: "active"
      },
      {
        id: "source_placeholder",
        name: "Fake candidate",
        url: "https://example.com/fake",
        tagline: "Placeholder should not enter D1.",
        circle: "ai_startups",
        status: "active"
      }
    ]
  });
  const plan = buildD1CandidateProductionPlan({
    workspaceId: "workspace_client",
    importRows: local.rows,
    d1: d1Fixture({
      workspaceLanes: [{ workspace_id: "workspace_client", lane_id: "ai_startups", enabled: 1, priority: 10 }]
    })
  });

  assert.equal(local.stats.skippedPlaceholder, 1);
  assert.equal(plan.stats.importedRawCandidates, 0);
  assert.equal(plan.stats.tasksAdded, 0);
  assert.equal(plan.stats.skippedNoWorkspaceLane, 1);
});

test("D1 production plan spreads tasks across available accounts", () => {
  const local = buildLocalCandidateRawRows({
    workspaceId: "workspace_client",
    sourceCandidates: [
      {
        id: "source_1",
        name: "SaaS onboarding queue",
        url: "https://saas.example.net/onboarding",
        tagline: "SaaS onboarding lesson for reducing support churn.",
        circle: "saas_founders",
        status: "active"
      },
      {
        id: "source_2",
        name: "SaaS pricing notes",
        url: "https://pricing.example.net/notes",
        tagline: "Pricing notes for founders reviewing trial conversion.",
        circle: "saas_founders",
        status: "active"
      }
    ]
  });
  const plan = buildD1CandidateProductionPlan({
    workspaceId: "workspace_client",
    date: "2026-06-14",
    importRows: local.rows,
    limit: 2,
    d1: d1Fixture()
  });

  assert.equal(plan.stats.tasksAdded, 2);
  assert.match(plan.sql, /account_id, assigned_to, manager_user_id[\s\S]+acct_01/);
  assert.match(plan.sql, /account_id, assigned_to, manager_user_id[\s\S]+acct_02/);
});
