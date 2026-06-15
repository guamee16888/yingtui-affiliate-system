import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeDesktopSetup, importDesktopAccounts } from "../scripts/lib/desktop-data-store.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { cleanupJsonPayload } from "../scripts/desktop-runtime-cleanup.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");

test("new desktop accounts default country to blank and display blank as dash", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_country_blank", workspaceName: "Country Blank" });
    const result = await importDesktopAccounts({ workspaceId: "workspace_country_blank", text: "@blank_country" });
    assert.equal(result.imported[0].country, "");
    assert.equal(result.imported[0].region, "");
    assert.equal(result.imported[0].timezone, "");
    assert.equal(result.imported[0].connectionStatus, "not_connected");
  });

  assert.match(appJs, /function accountCountryLabel/);
  assert.match(appJs, /return accountCountryValue\(account\) \|\| "-"/);
  assert.match(appJs, /data-account-inline-field="country"/);
  assert.match(appJs, /inline-account-input/);
});

test("timezone does not infer country and CSV timezone is ignored", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_no_timezone_country", workspaceName: "No Timezone Country" });
    await importDesktopAccounts({
      workspaceId: "workspace_no_timezone_country",
      csv: "handle,lane,timezone,language\n@tz_only,ai_startups,Asia/Tokyo,en"
    });
    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.handle === "@tz_only");
    assert.ok(account);
    assert.equal(account.country, "");
    assert.equal(account.region, "");
    assert.equal(account.timezone, "");
  });
});

test("runtime cleanup clears auto default country codes but keeps manual country", () => {
  const cleaned = cleanupJsonPayload({
    items: [
      { accountId: "auto_us", handle: "@auto_us", country: "US", region: "US", connectionStatus: "connected", accountType: "demo" },
      { accountId: "manual_japan", handle: "@manual_japan", country: "日本", countryManual: true, connectionStatus: "not_connected" }
    ]
  }).value;

  assert.equal(cleaned.items[0].country, "");
  assert.equal(cleaned.items[0].region, "");
  assert.equal(cleaned.items[0].countryManual, false);
  assert.equal(cleaned.items[0].connectionStatus, "not_connected");
  assert.equal(cleaned.items[1].country, "日本");
  assert.equal(cleaned.items[1].countryManual, true);
});
