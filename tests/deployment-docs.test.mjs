import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("deployment docs describe public admin and app domains", async () => {
  const [domain, publicDemo, adminAccess, adminPages, cloudflareAccess] = await Promise.all([
    readFile("docs/deployment/domain-plan.md", "utf8"),
    readFile("docs/deployment/public-demo.md", "utf8"),
    readFile("docs/deployment/admin-access.md", "utf8"),
    readFile("docs/deployment/admin-pages-project.md", "utf8"),
    readFile("docs/deployment/cloudflare-access-admin.md", "utf8")
  ]);
  for (const text of [domain, publicDemo, adminAccess, adminPages, cloudflareAccess]) {
    assert.ok(text.includes("guamee.org"));
  }
  assert.ok(domain.includes("admin.guamee.org"));
  assert.ok(domain.includes("app.guamee.org"));
  assert.ok(publicDemo.includes("build:public"));
  assert.ok(publicDemo.includes("release:check:public"));
  assert.ok(adminAccess.includes("Cloudflare Access"));
  assert.ok(adminAccess.includes("build:admin-demo"));
  assert.ok(adminAccess.includes("release:check:admin"));
  assert.ok(adminPages.includes("ai-creator-os-admin"));
  assert.ok(cloudflareAccess.includes("Self-hosted"));
});
