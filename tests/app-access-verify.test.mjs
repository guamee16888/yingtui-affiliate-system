import assert from "node:assert/strict";
import test from "node:test";
import { classifyAppAccessResponse, parseVerifyArgs, verifyAppAccess } from "../scripts/verify-app-access.mjs";

test("verify-app-access flags publicly visible app placeholder", () => {
  const result = classifyAppAccessResponse({
    status: 200,
    body: "<html><body>AI Creator OS App 受保护应用预览</body></html>"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "APP_PUBLIC");
});

test("verify-app-access treats redirect and forbidden statuses as protected", () => {
  for (const status of [302, 401, 403]) {
    const result = classifyAppAccessResponse({ status, body: "" });
    assert.equal(result.ok, true);
    assert.equal(result.code, "ACCESS_PROTECTED");
  }
});

test("verify-app-access detects Cloudflare Access login body", () => {
  const result = classifyAppAccessResponse({
    status: 200,
    body: "Cloudflare Access login required"
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "ACCESS_PROTECTED");
});

test("verify-app-access supports expect-open", async () => {
  const result = await verifyAppAccess({
    url: "http://127.0.0.1:4175/",
    expectOpen: true,
    fetchImpl: async () => fakeResponse(200, "AI Creator OS App 受保护应用预览")
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "EXPECTED_OPEN");
});

test("verify-app-access parses url and expect-open flags", () => {
  assert.deepEqual(parseVerifyArgs(["--url", "http://127.0.0.1:4175/", "--expect-open"]), {
    url: "http://127.0.0.1:4175/",
    expectOpen: true
  });
});

function fakeResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || "";
      }
    },
    async text() {
      return body;
    }
  };
}
