import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { appendDesktopLog } from "../scripts/lib/storage/interface.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop logs are written under appData and redact sensitive fields", async () => {
  await withDesktopTestEnv(async (dir) => {
    const result = await appendDesktopLog({
      type: "desktop.test",
      summary: "token=abc secret=def password=ghi cookie=jkl",
      metadata: {
        apiKey: "hidden",
        safe: "visible"
      }
    });
    assert.equal(result.path.startsWith(dir), true);
    const text = await readFile(result.path, "utf8");
    assert.match(text, /\[redacted\]/);
    assert.doesNotMatch(text, /hidden|abc|def|ghi|jkl/);
    assert.match(text, /visible/);
  });
});
