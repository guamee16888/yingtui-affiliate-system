import assert from "node:assert/strict";
import test from "node:test";
import {
  loadDesktopAdsBrowserStatus,
  openDesktopAdsBrowserProfile,
  saveDesktopAdsBrowserConfig,
  testDesktopAdsBrowserConfig
} from "../scripts/lib/ads-browser.mjs";
import { completeDesktopSetup, ensureDesktopAccountSlots, importDesktopAccounts, updateDesktopAccountConfig } from "../scripts/lib/storage/interface.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("ADS browser config is saved with masked key", async () => {
  await withDesktopTestEnv(async () => {
    const status = await saveDesktopAdsBrowserConfig({
      baseUrl: "http://local.adspower.net:50325/",
      accessText: "ads_secret_key_123456"
    });
    assert.equal(status.configured, true);
    assert.equal(status.baseUrl, "http://local.adspower.net:50325");
    assert.equal(status.accessConfigured, true);
    assert.equal(status.maskedAccess, "ads_************3456");

    const loaded = await loadDesktopAdsBrowserStatus();
    assert.equal(loaded.configured, true);
    assert.equal(loaded.baseUrl, "http://local.adspower.net:50325");
  });
});

test("ADS browser test and open use Local API endpoints", async () => {
  await withDesktopTestEnv(async () => {
    await saveDesktopAdsBrowserConfig({ baseUrl: "http://local.adspower.net:50325", accessText: "key" });
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), authorization: options.headers.authorization });
      return Response.json({ code: 0, msg: "success", data: { ws: "ws://127.0.0.1/devtools/browser/mock" } });
    };

    const testResult = await testDesktopAdsBrowserConfig({ fetchImpl });
    assert.equal(testResult.ok, true);
    assert.match(calls[0].url, /\/api\/v1\/user\/list\?page=1&page_size=1$/);
    assert.equal(calls[0].authorization, "Bearer key");

    const openResult = await openDesktopAdsBrowserProfile({ adsProfileId: "123456" }, { fetchImpl });
    assert.equal(openResult.ok, true);
    assert.match(calls[1].url, /\/api\/v1\/browser\/start\?user_id=123456&open_tabs=1&ip_tab=0$/);
  });
});

test("desktop account stores ADS browser provider and environment id", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_ads", workspaceName: "ADS Test" });
    const result = await importDesktopAccounts({
      workspaceId: "workspace_ads",
      csv: "handle,workEnvironment,adsProfileId\n@ads_account,ads,987654"
    });
    const accountId = result.imported[0].accountId;
    await updateDesktopAccountConfig({
      accountId,
      browserProvider: "default",
      adsProfileId: "111222"
    });
    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.accountId === accountId);
    assert.equal(account.browserProvider, "default");
    assert.equal(account.adsProfileId, "111222");
  });
});

test("desktop account slots can be filled by later account imports", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_slots", workspaceName: "Slots Test" });
    await importDesktopAccounts({ workspaceId: "workspace_slots", text: "@existing_one\n@existing_two" });
    const slots = await ensureDesktopAccountSlots({ workspaceId: "workspace_slots", count: 5 });
    assert.equal(slots.createdCount, 3);
    assert.equal(slots.total, 5);

    const result = await importDesktopAccounts({
      workspaceId: "workspace_slots",
      csv: "handle,workEnvironment,adsProfileId\n@new_slot_fill,ads,555777"
    });
    assert.equal(result.imported[0].handle, "@new_slot_fill");
    assert.equal(result.imported[0].accountId, "xacc_slot_003");
    assert.equal(result.imported[0].browserProvider, "ads");
    assert.equal(result.imported[0].adsProfileId, "555777");

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const scoped = accounts.items.filter((item) => item.workspaceId === "workspace_slots");
    assert.equal(scoped.length, 5);
    assert.equal(scoped.filter((item) => item.status === "empty_slot").length, 2);
  });
});
