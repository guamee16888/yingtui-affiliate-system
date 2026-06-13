import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const backendDocs = [
  "docs/backend/app-backend-contract.md",
  "docs/backend/data-boundary.md",
  "docs/backend/d1-schema.sql",
  "docs/backend/api-contract.md",
  "docs/backend/auth-plan.md",
  "docs/backend/json-to-d1-migration-plan.md",
  "docs/backend/security-checklist.md",
  "docs/backend/deployment-plan.md"
];

const coreTables = [
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

test("backend contract docs exist and are not empty", async () => {
  for (const file of backendDocs) {
    const text = await readFile(file, "utf8");
    assert.ok(text.trim().length > 80, `${file} should contain contract text`);
  }
});

test("d1 schema contains required tables", async () => {
  const schema = await readFile("docs/backend/d1-schema.sql", "utf8");
  for (const table of coreTables) {
    assert.match(schema, new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${table}\\b`, "i"));
  }
});

test("api and auth contracts keep role and domain boundaries", async () => {
  const [api, auth, boundary] = await Promise.all([
    readFile("docs/backend/api-contract.md", "utf8"),
    readFile("docs/backend/auth-plan.md", "utf8"),
    readFile("docs/backend/data-boundary.md", "utf8")
  ]);
  for (const role of ["admin", "manager", "staff"]) {
    assert.ok(api.includes(role), `api contract should include ${role}`);
    assert.ok(auth.includes(role), `auth plan should include ${role}`);
  }
  for (const domain of ["guamee.org", "ad.guamee.org", "app.guamee.org"]) {
    assert.ok(boundary.includes(domain), `data boundary should include ${domain}`);
  }
});
