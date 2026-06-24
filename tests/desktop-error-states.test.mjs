import assert from "node:assert/strict";
import test from "node:test";
import { importDesktopBackup } from "../scripts/lib/storage/interface.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop backup import reports a friendly invalid-format error", async () => {
  await withDesktopTestEnv(async () => {
    await assert.rejects(
      importDesktopBackup({ backupText: "{\"bad\":true}" }),
      /备份格式无效/
    );
  });
});
