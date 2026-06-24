import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanupDesktopRuntime } from "../scripts/desktop/desktop-runtime-cleanup.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop runtime cleanup backs up data and removes visible legacy terms", async () => {
  await withDesktopTestEnv(async (appDataDir) => {
    const dataDir = path.join(appDataDir, "data");
    const seedDataDir = path.join(appDataDir, "seed");
    await mkdir(dataDir, { recursive: true });
    await mkdir(seedDataDir, { recursive: true });
    await writeJson(path.join(dataDir, "x-accounts.json"), {
      version: 1,
      items: [
        {
          accountId: "acct_demo_1",
          handle: "@demo_operator_01",
          persona: "Desktop Demo",
          notes: "Demo account for desktop matrix view.",
          timezone: "America/New_York",
          connectionStatus: "connected",
          accountType: "demo"
        },
        {
          accountId: "acct_real",
          handle: "@real_account",
          persona: "Real Account",
          timezone: "Asia/Tokyo",
          connectionStatus: "connected",
          accountType: "official",
          oauthConnectionId: "xconn_real"
        }
      ]
    });
    await writeJson(path.join(dataDir, "workspaces.json"), {
      version: 1,
      items: [{ workspaceId: "workspace_default", name: "AI Creator OS Desktop Demo" }]
    });
    await writeJson(path.join(seedDataDir, "users.json"), {
      version: 1,
      items: [{ userId: "user_staff_demo", name: "Demo Staff" }]
    });

    const result = await cleanupDesktopRuntime({
      appDataDir,
      seedDataDir,
      now: new Date("2026-06-15T00:00:00.000Z")
    });

    assert.match(result.backupDir, /runtime-cleanup-2026-06-15T00-00-00-000Z$/);
    const backupText = await readFile(path.join(result.backupDir, "data", "x-accounts.json"), "utf8");
    assert.match(backupText, /@demo_operator_01/);

    const accounts = await readJson(path.join(dataDir, "x-accounts.json"));
    assert.equal(accounts.items.length, 2);
    assert.equal(accounts.items[0].handle, "@creator_ops_01");
    assert.equal(accounts.items[0].timezone, "");
    assert.equal(accounts.items[0].connectionStatus, "not_connected");
    assert.equal(accounts.items[1].timezone, "");
    assert.equal(accounts.items[1].connectionStatus, "connected");

    const workspaceText = await readFile(path.join(dataDir, "workspaces.json"), "utf8");
    assert.doesNotMatch(workspaceText, /Desktop Demo/);
    const seedText = await readFile(path.join(seedDataDir, "users.json"), "utf8");
    assert.doesNotMatch(seedText, /Demo Staff/);
  });
});

test("desktop runtime cleanup command is wired in package scripts", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["desktop:runtime:cleanup"], "node scripts/desktop/desktop-runtime-cleanup.mjs");
});

async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
