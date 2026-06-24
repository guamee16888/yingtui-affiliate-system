import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin preflight command and deployment docs exist", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.scripts["admin:preflight"], "node scripts/build/admin-preflight.mjs");
  assert.equal(pkg.scripts["verify:admin-access"], "node scripts/build/verify-admin-access.mjs");

  const [pagesDoc, accessDoc, readme] = await Promise.all([
    readFile("docs/deployment/admin-pages-project.md", "utf8"),
    readFile("docs/deployment/cloudflare-access-admin.md", "utf8"),
    readFile("README.md", "utf8")
  ]);

  assert.ok(pagesDoc.includes("ai-creator-os-admin"));
  assert.ok(pagesDoc.includes("npm run build:admin-demo"));
  assert.ok(pagesDoc.includes("admin.guamee.org"));
  assert.ok(accessDoc.includes("Cloudflare Access"));
  assert.ok(accessDoc.includes("Self-hosted"));
  assert.ok(accessDoc.includes("npm run verify:admin-access"));
  assert.ok(readme.includes("admin.guamee.org"));
  assert.ok(readme.includes("npm run admin:preflight"));
});
