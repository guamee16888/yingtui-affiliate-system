import assert from "node:assert/strict";
import test from "node:test";
import { getAuthContext } from "../scripts/lib/app-api/auth-context.mjs";
import { assertJwtClaims, decodeJwt, getCloudflareAccessPayload } from "../scripts/lib/app-api/cloudflare-access-auth.mjs";

test("staging requires Cloudflare Access JWT", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session"), {
      collections: fixtures(),
      env: { APP_ENV: "staging" }
    }),
    (error) => error.code === "UNAUTHENTICATED"
  );
});

test("staging rejects devEmail", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session?devEmail=manager@example.com"), {
      collections: fixtures(),
      env: { APP_ENV: "staging" },
      accessJwtPayload: { email: "manager@example.com" }
    }),
    (error) => error.code === "DEV_EMAIL_DISABLED"
  );
});

test("staging does not trust plain Cloudflare email header", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session", {
      "cf-access-authenticated-user-email": "manager@example.com"
    }), {
      collections: fixtures(),
      env: { APP_ENV: "staging" }
    }),
    (error) => error.code === "UNAUTHENTICATED"
  );
});

test("injected Access payload maps to user and workspace", async () => {
  const context = await getAuthContext(request("/api/app/v1/session"), {
    collections: fixtures(),
    env: { APP_ENV: "staging" },
    accessJwtPayload: { email: "manager@example.com", aud: "aud", exp: future() }
  });
  assert.equal(context.email, "manager@example.com");
  assert.equal(context.userId, "manager_a");
  assert.equal(context.workspaceId, "workspace_a");
  assert.equal(context.isDev, false);
});

test("Access payload injection avoids real Cloudflare cert requests", async () => {
  const payload = await getCloudflareAccessPayload(request("/api/app/v1/session"), {
    accessJwtPayload: { email: "manager@example.com" },
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    }
  });
  assert.equal(payload.email, "manager@example.com");
});

test("Access JWT claim validation checks audience and expiry", () => {
  assertJwtClaims({ aud: ["expected"], exp: future() }, "expected");
  assert.throws(() => assertJwtClaims({ aud: ["other"], exp: future() }, "expected"), /audience/);
  assert.throws(() => assertJwtClaims({ aud: ["expected"], exp: 1 }, "expected"), /过期/);
});

test("decodeJwt rejects malformed tokens", () => {
  assert.throws(() => decodeJwt("not.a.jwt"), /解析失败|格式无效/);
});

function request(pathname, headers = {}) {
  return { url: pathname, headers };
}

function fixtures() {
  return {
    users: [
      { userId: "manager_a", email: "manager@example.com", name: "Manager A", role: "manager", active: true, workspaceId: "workspace_a" }
    ],
    workspaces: [
      { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: [], active: true }
    ],
    assignments: [],
    xAccounts: []
  };
}

function future() {
  return Math.floor(Date.now() / 1000) + 3600;
}
