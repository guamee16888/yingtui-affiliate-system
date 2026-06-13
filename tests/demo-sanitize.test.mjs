import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sanitizeDemoData } from "../scripts/lib/demo-sanitize.mjs";

test("demo sanitize does not overwrite real data and removes sensitive fields", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aios-demo-"));
  const sourceDataDir = path.join(dir, "data");
  const sourceConfigDir = path.join(dir, "config");
  const targetDataDir = path.join(dir, "data-demo");
  const targetConfigDir = path.join(dir, "config-demo");

  await writeJson(path.join(sourceDataDir, "users.json"), {
    version: 1,
    items: [{ userId: "user_real", name: "Real Name", role: "manager", notes: "private note" }]
  });
  await writeJson(path.join(sourceDataDir, "x-accounts.json"), {
    version: 1,
    items: [{ accountId: "account_real", handle: "@real_handle", notes: "private account" }]
  });
  await writeJson(path.join(sourceDataDir, "x-connections.json"), {
    version: 1,
    items: [{ connectionId: "conn_real", accountId: "account_real", tokenRef: "prod_token_ref", xUserId: "123", status: "connected" }]
  });
  await writeJson(path.join(sourceDataDir, "post-ledger.json"), {
    version: 1,
    items: [{ ledgerId: "ledger_real", postedUrl: "https://x.com/real/status/12345", xPostId: "12345", postedText: "real post" }]
  });
  await writeJson(path.join(sourceDataDir, "feedback.json"), {
    version: 1,
    entries: [{ id: "feedback_real", postedUrl: "https://x.com/real/status/12345", notes: "private", metrics: { impressions: 100 } }]
  });
  await writeJson(path.join(sourceConfigDir, "affiliate-links.json"), {
    links: [{ name: "Private", affiliateLink: "https://private.example/ref" }]
  });

  await sanitizeDemoData({ sourceDataDir, sourceConfigDir, targetDataDir, targetConfigDir, now: "2026-06-13T00:00:00.000Z" });

  const realUsers = JSON.parse(await readFile(path.join(sourceDataDir, "users.json"), "utf8"));
  assert.equal(realUsers.items[0].name, "Real Name");

  const users = await readJson(path.join(targetDataDir, "users.json"));
  const accounts = await readJson(path.join(targetDataDir, "x-accounts.json"));
  const connections = await readJson(path.join(targetDataDir, "x-connections.json"));
  const ledger = await readJson(path.join(targetDataDir, "post-ledger.json"));
  const feedback = await readJson(path.join(targetDataDir, "feedback.json"));
  const affiliate = await readJson(path.join(targetConfigDir, "affiliate-links.json"));

  assert.equal(users.mode, "demo");
  assert.equal(users.items[0].name, "Demo Manager 1");
  assert.equal(users.items[0].notes, "");
  assert.match(accounts.items[0].handle, /^@demo_ai_\d{3}$/);
  assert.equal(accounts.items[0].notes, "");
  assert.equal(connections.items[0].tokenRef, "demo_only");
  assert.equal(connections.items[0].xUserId, "");
  assert.equal(connections.items[0].status, "not_connected");
  assert.equal(ledger.items[0].postedUrl, "");
  assert.equal(ledger.items[0].xPostId, "");
  assert.equal(feedback.entries[0].postedUrl, "");
  assert.equal(feedback.entries[0].notes, "");
  assert.deepEqual(affiliate.links, []);
});

async function writeJson(filePath, data) {
  await import("node:fs/promises").then((fs) => fs.mkdir(path.dirname(filePath), { recursive: true }));
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
