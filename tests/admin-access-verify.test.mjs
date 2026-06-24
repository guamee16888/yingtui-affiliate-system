import assert from "node:assert/strict";
import test from "node:test";
import { classifyAdminAccessResponse, parseVerifyArgs, verifyAdminAccess } from "../scripts/build/verify-admin-access.mjs";

test("verify-admin-access flags publicly visible admin demo", () => {
  const result = classifyAdminAccessResponse({
    status: 200,
    body: "<html><body>AI Creator OS 受保护总后台演示</body></html>"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "ADMIN_PUBLIC");
});

test("verify-admin-access treats redirect and forbidden statuses as protected", () => {
  for (const status of [302, 401, 403]) {
    const result = classifyAdminAccessResponse({ status, body: "" });
    assert.equal(result.ok, true);
    assert.equal(result.code, "ACCESS_PROTECTED");
  }
});

test("verify-admin-access detects Cloudflare Access login body", () => {
  const result = classifyAdminAccessResponse({
    status: 200,
    body: "Cloudflare Access login required"
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "ACCESS_PROTECTED");
});

test("verify-admin-access parses url and expect-open flags", () => {
  assert.deepEqual(parseVerifyArgs(["--url", "https://ad.guamee.org", "--expect-open"]), {
    url: "https://ad.guamee.org",
    expectOpen: true
  });
});

test("verify-admin-access allows open response when expect-open is set", async () => {
  const result = await verifyAdminAccess({
    url: "http://127.0.0.1:4175/dashboard/",
    expectOpen: true,
    fetchImpl: async () => fakeResponse(200, "AI Creator OS 受保护总后台演示")
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "EXPECTED_OPEN");
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
