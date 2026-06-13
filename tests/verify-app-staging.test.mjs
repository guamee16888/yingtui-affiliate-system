import assert from "node:assert/strict";
import test from "node:test";
import { classifyAppStagingResponse, parseVerifyAppStagingArgs, verifyAppStaging } from "../scripts/verify-app-staging.mjs";

test("verify-app-staging treats Access redirects and forbidden statuses as protected", () => {
  for (const status of [302, 401, 403]) {
    const result = classifyAppStagingResponse({ status, body: "" });
    assert.equal(result.ok, true);
    assert.equal(result.code, "ACCESS_PROTECTED");
  }
});

test("verify-app-staging detects Cloudflare Access login content", () => {
  const result = classifyAppStagingResponse({
    status: 200,
    body: "Cloudflare Access login required"
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "ACCESS_PROTECTED");
});

test("verify-app-staging flags publicly visible app", () => {
  const result = classifyAppStagingResponse({
    status: 200,
    body: "<main>AI Creator OS App 真实工作区</main>"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "APP_STAGING_PUBLIC");
});

test("verify-app-staging reports not configured domains clearly", async () => {
  const result = await verifyAppStaging({
    fetchImpl: async () => {
      throw new Error("ENOTFOUND");
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "APP_STAGING_NOT_CONFIGURED");
});

test("verify-app-staging parses flags", () => {
  assert.deepEqual(parseVerifyAppStagingArgs(["--url", "http://127.0.0.1:4175/", "--expect-protected"]), {
    url: "http://127.0.0.1:4175/",
    expectProtected: true,
    expectOpen: false
  });
});
