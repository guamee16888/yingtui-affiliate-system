import test from "node:test";
import assert from "node:assert/strict";
import { publishXPost } from "../scripts/lib/x-publisher.mjs";

test("mock dry-run publisher returns stable public response", async () => {
  const result = await publishXPost({
    task: { taskId: "task_1", accountId: "acc_1", copyText: "A dry-run X post." },
    account: { accountId: "acc_1", handle: "@example" },
    connection: { accountId: "acc_1", handle: "@example", status: "connected", tokenRef: "server_side_only" },
    dryRun: true,
    live: false
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.postedUrl, "https://x.com/example/status/dry-run");
  assert.equal(JSON.stringify(result).includes("ACCESS_TOKEN"), false);
  assert.equal(JSON.stringify(result).includes("server_side_only"), false);
});

test("live publisher blocks missing connection before token use", async () => {
  const result = await publishXPost({
    task: { taskId: "task_1", accountId: "acc_1", copyText: "A live X post." },
    account: { accountId: "acc_1" },
    connection: null,
    dryRun: false,
    live: true,
    env: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /connection/);
});
