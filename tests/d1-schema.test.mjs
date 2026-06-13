import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredTables = [
  "workspaces",
  "users",
  "workspace_members",
  "x_accounts",
  "assignments",
  "content_lanes",
  "workspace_lanes",
  "source_connectors",
  "source_feeds",
  "raw_candidates",
  "tools",
  "topics",
  "copy_library",
  "post_tasks",
  "post_ledger",
  "feedback",
  "publish_settings",
  "x_connections",
  "publish_jobs",
  "publish_attempts",
  "audit_logs",
  "api_events"
];

const workspacePrivateTables = [
  "workspace_members",
  "x_accounts",
  "assignments",
  "workspace_lanes",
  "raw_candidates",
  "topics",
  "copy_library",
  "post_tasks",
  "post_ledger",
  "feedback",
  "publish_settings",
  "x_connections",
  "publish_jobs",
  "publish_attempts",
  "audit_logs",
  "api_events"
];

test("D1 migration contains required app tables", async () => {
  const sql = await readFile("db/migrations/0001_initial.sql", "utf8");
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${table}\\b`, "i"), table);
  }
});

test("workspace-private D1 tables include workspace_id", async () => {
  const sql = await readFile("db/migrations/0001_initial.sql", "utf8");
  for (const table of workspacePrivateTables) {
    assert.match(tableBody(sql, table), /workspace_id\s+TEXT/i, table);
  }
});

test("D1 schema keeps token material indirect and ledger idempotent", async () => {
  const sql = await readFile("db/migrations/0001_initial.sql", "utf8");
  assert.match(tableBody(sql, "x_connections"), /token_ref\s+TEXT/i);
  assert.doesNotMatch(tableBody(sql, "x_connections"), /access_token|refresh_token|client_secret/i);
  assert.match(tableBody(sql, "post_ledger"), /UNIQUE\s*\(\s*workspace_id\s*,\s*task_id\s*\)/i);
});

test("D1 migration adds common query indexes", async () => {
  const sql = await readFile("db/migrations/0001_initial.sql", "utf8");
  for (const field of ["workspace_id", "task_id", "account_id", "user_id", "status", "created_at"]) {
    assert.match(sql, new RegExp(`index[\\s\\S]+${field}`, "i"), field);
  }
});

function tableBody(sql, table) {
  const match = sql.match(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table}\\s*\\(([\\s\\S]*?)\\);`, "i"));
  return match?.[1] ?? "";
}
