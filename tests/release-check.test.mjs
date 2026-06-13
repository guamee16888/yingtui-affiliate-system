import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runReleaseCheck } from "../scripts/lib/release-check.mjs";

test("release check passes a sanitized static demo dist", async () => {
  const distDir = await makeDemoDist();
  const result = await runReleaseCheck({ distDir });
  assert.deepEqual(result.errors, []);
  assert.ok(result.passed.length > 10);
});

test("release check catches token leakage, real handles, posted urls, and env files", async () => {
  const distDir = await makeDemoDist();
  await writeFile(path.join(distDir, ".env"), "X_CLIENT_SECRET=secret\n", "utf8");
  await writeJson(path.join(distDir, "data", "x-accounts.json"), demoCollection([
    { accountId: "real", handle: "@real_handle", notes: "" }
  ]));
  await writeJson(path.join(distDir, "data", "post-ledger.json"), demoCollection([
    { ledgerId: "ledger_real", postedUrl: "https://x.com/real/status/12345", xPostId: "" }
  ]));
  await writeJson(path.join(distDir, "data", "x-connections.json"), demoCollection([
    { connectionId: "conn", accountId: "real", status: "connected", tokenRef: "prod_token" }
  ]));

  const result = await runReleaseCheck({ distDir });
  assert.ok(result.errors.some((item) => item.includes("env file")));
  assert.ok(result.errors.some((item) => item.includes("real-looking X handle")));
  assert.ok(result.errors.some((item) => item.includes("real postedUrl")));
  assert.ok(result.errors.some((item) => item.includes("tokenRef") || item.includes("not disabled")));
});

async function makeDemoDist() {
  const distDir = await mkdtemp(path.join(os.tmpdir(), "aios-release-"));
  await mkdir(path.join(distDir, "data"), { recursive: true });
  await mkdir(path.join(distDir, "config"), { recursive: true });
  await mkdir(path.join(distDir, "api", "manager"), { recursive: true });
  await mkdir(path.join(distDir, "api", "staff"), { recursive: true });
  await mkdir(path.join(distDir, "dashboard"), { recursive: true });
  await mkdir(path.join(distDir, "manager"), { recursive: true });
  await mkdir(path.join(distDir, "staff"), { recursive: true });

  const files = {
    "users.json": demoCollection([{ userId: "user_owner", name: "Demo Manager 1", notes: "" }]),
    "x-accounts.json": demoCollection([{ accountId: "demo", handle: "@demo_ai_001", notes: "" }]),
    "x-connections.json": demoCollection([{ connectionId: "conn", accountId: "demo", status: "not_connected", tokenRef: "demo_only", xUserId: "" }]),
    "post-ledger.json": demoCollection([{ ledgerId: "ledger", postedUrl: "", xPostId: "" }]),
    "feedback.json": { version: 1, mode: "demo", demo: true, entries: [{ id: "feedback", postedUrl: "", notes: "" }] },
    "publish-settings.json": { version: 1, mode: "demo", demo: true, settings: { globalAutoPublishEnabled: false, dryRunByDefault: true, allowedPublishModes: ["manual", "scheduled"] } },
    "workspaces.json": demoCollection([{ workspaceId: "workspace_default", name: "Demo Workspace" }]),
    "source-connectors.json": demoCollection([{ connectorId: "manual", name: "Manual", type: "manual", status: "active" }])
  };
  for (const [name, data] of Object.entries(files)) await writeJson(path.join(distDir, "data", name), data);
  await writeJson(path.join(distDir, "config", "affiliate-links.json"), { mode: "demo", demo: true, links: [] });
  await writeJson(path.join(distDir, "api", "manager", "summary"), { ok: true, data: { deployment: { mode: "demo", readOnly: true } } });
  await writeJson(path.join(distDir, "api", "staff", "summary"), { ok: true, data: { deployment: { mode: "demo", readOnly: true } } });
  await writeFile(path.join(distDir, "index.html"), "AI Creator OS 只读演示", "utf8");
  await writeFile(path.join(distDir, "dashboard", "index.html"), "<section id=\"modeBanner\"></section>", "utf8");
  await writeFile(path.join(distDir, "manager", "index.html"), "<section id=\"modeBanner\"></section>", "utf8");
  await writeFile(path.join(distDir, "staff", "index.html"), "<section id=\"modeBanner\"></section>", "utf8");
  return distDir;
}

function demoCollection(items) {
  return { version: 1, mode: "demo", demo: true, items };
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
