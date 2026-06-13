import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wrangler staging config has app DB binding placeholder", async () => {
  const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  const staging = config.env?.production;
  assert.equal(staging?.name, "ai-creator-os-app-staging");
  assert.equal(staging?.vars?.APP_ENV, "staging");
  assert.equal(staging?.vars?.APP_STORAGE_MODE, "d1");
  assert.equal(staging?.d1_databases?.[0]?.binding, "DB");
  assert.equal(staging?.d1_databases?.[0]?.database_name, "ai_creator_os_app_staging");
  assert.match(staging?.d1_databases?.[0]?.database_id || "", /^[0-9a-f-]{36}$/);
});

test("package exposes staging D1 and verify commands", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  for (const script of [
    "app:d1:status",
    "app:d1:create:staging",
    "app:d1:migrate:staging",
    "app:d1:seed:staging",
    "app:seed:staging-sql",
    "verify:app-staging"
  ]) {
    assert.ok(pkg.scripts[script], `missing ${script}`);
  }
});
