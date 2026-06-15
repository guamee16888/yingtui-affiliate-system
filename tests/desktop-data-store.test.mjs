import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { completeDesktopSetup, exportDesktopBackupPackage, resetDesktopDemoData } from "../scripts/lib/desktop-data-store.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop demo seed and backup package write to appData", async () => {
  await withDesktopTestEnv(async (dir) => {
    await resetDesktopDemoData();
    await completeDesktopSetup({ mode: "demo" });
    const backup = await exportDesktopBackupPackage();
    assert.equal(backup.path.startsWith(dir), true);
    assert.ok(backup.files > 0);
    const text = await readFile(backup.path, "utf8");
    const payload = JSON.parse(text);
    assert.equal(payload.product, "AI Creator OS Desktop");
    assert.ok(payload.files["data/workspaces.json"]);
  });
});
