import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateAppStagingSeed } from "../scripts/d1/seed-app-staging.mjs";

test("app staging seed is safe and idempotent", async () => {
  const result = await validateAppStagingSeed();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(result.counts.accounts >= 3);
  assert.ok(result.counts.tasks >= 5);
});

test("app staging seed contains no secrets or real posted URLs", async () => {
  const sql = await readFile("db/seed/app-staging-demo.sql", "utf8");
  assert.match(sql, /workspace_staging_demo/);
  assert.match(sql, /INSERT OR REPLACE/);
  assert.doesNotMatch(sql, /access_token|refresh_token|client_secret|api[_-]?key|bearer\s+[a-z0-9._-]+/i);
  assert.doesNotMatch(sql, /x\.com\/[^'"\s]+\/status\/\d+|twitter\.com\/[^'"\s]+\/status\/\d+|postedUrl/i);
  assert.doesNotMatch(sql, /affiliate(Link|Url)|partnerstack|impact\.com|rewardful/i);
});
