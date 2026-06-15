import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mac trial release commands are wired", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.scripts["icon:mac"], "node scripts/generate-mac-icon.mjs");
  assert.equal(pkg.scripts["desktop:release:mac-trial"], "node scripts/desktop-release-mac-trial.mjs");
  assert.equal(pkg.scripts["desktop:smoke:mac-trial"], "node scripts/desktop-mac-trial-smoke.mjs");
});

test("mac trial release directory and local app artifacts are gitignored", async () => {
  const gitignore = await readFile(".gitignore", "utf8");
  for (const pattern of ["release-local/", "*.dmg", "*.zip", "*.app", "dist-desktop/"]) {
    assert.match(gitignore, new RegExp(escapeRegExp(pattern)));
  }
});

test("mac trial README is generated in the local release directory when present", async () => {
  const releaseScript = await readFile("scripts/desktop-release-mac-trial.mjs", "utf8");
  assert.match(releaseScript, /README-MAC-TRIAL\.md/);
  assert.match(releaseScript, /系统设置/);
  assert.match(releaseScript, /Library\/Application Support\/AI Creator OS/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
