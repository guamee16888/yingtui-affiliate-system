import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  clearDesktopXOAuthConfig,
  finishDesktopXOAuthCallback,
  loadDesktopXOAuthStatus,
  revokeDesktopXOAuth,
  saveDesktopXOAuthConfig,
  startDesktopXOAuth
} from "../scripts/lib/storage/interface.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

const serverSource = [
  await readFile(new URL("../scripts/ops/serve-dashboard.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../scripts/lib/desktop/api-get-routes.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../scripts/lib/desktop/api-post-routes.mjs", import.meta.url), "utf8")
].join("\n");

test("desktop server exposes the X OAuth routes", () => {
  for (const route of [
    "/api/oauth/x/start",
    "/api/oauth/x/callback",
    "/api/oauth/x/revoke",
    "/api/desktop/x-oauth/status",
    "/api/desktop/x-oauth/config",
    "/api/desktop/x-oauth/clear"
  ]) {
    assert.match(serverSource, new RegExp(route.replace(/[/?]/g, "\\$&")));
  }
});

test("desktop X OAuth config is saved in appData with sanitized status", async () => {
  await withDesktopTestEnv(async (dir) => {
    await assert.rejects(startDesktopXOAuth(), /请先在设置里配置 X API/);

    const status = await saveDesktopXOAuthConfig({
      clientId: "client_1234567890",
      clientSecret: "secret_abcdefghijklmnopqrstuvwxyz",
      callbackUrl: "http://127.0.0.1:5288/api/oauth/x/callback",
      scopes: "tweet.read tweet.write users.read offline.access"
    });

    assert.equal(status.configured, true);
    assert.equal(status.clientId, "client_1234567890");
    assert.notEqual(status.maskedClientSecret, "secret_abcdefghijklmnopqrstuvwxyz");
    assert.match(status.maskedClientSecret, /^\w{4}\*+\w{4}$/);

    const runtimePath = path.join(dir, "data", "desktop-x-oauth.json");
    await access(runtimePath);
    const runtimeConfig = JSON.parse(await readFile(runtimePath, "utf8"));
    assert.equal(runtimeConfig.clientId, "client_1234567890");

    const start = await startDesktopXOAuth();
    assert.match(start.authorizationUrl, /^https:\/\/twitter\.com\/i\/oauth2\/authorize\?/);
    assert.equal(start.callbackUrl, "http://127.0.0.1:5288/api/oauth/x/callback");

    const revoked = await revokeDesktopXOAuth();
    assert.equal(revoked.configured, true);
    assert.match(revoked.tokenStorageLabel, /未写入 token|退出/);

    const cleared = await clearDesktopXOAuthConfig();
    assert.equal(cleared.configured, false);
    assert.equal((await loadDesktopXOAuthStatus()).configured, false);
  });
});

test("desktop X OAuth callback exchanges token and creates official account", async () => {
  await withDesktopTestEnv(async (dir) => {
    await saveDesktopXOAuthConfig({
      clientId: "client_1234567890",
      clientSecret: "secret_abcdefghijklmnopqrstuvwxyz",
      consumerKey: "consumer_1234567890",
      consumerSecret: "consumer_secret_abcdefghijklmnopqrstuvwxyz",
      bearerToken: "bearer_abcdefghijklmnopqrstuvwxyz",
      callbackUrl: "http://127.0.0.1:5288/api/oauth/x/callback",
      scopes: "tweet.read tweet.write users.read offline.access"
    });
    const start = await startDesktopXOAuth();
    const state = new URL(start.authorizationUrl).searchParams.get("state");
    const calls = [];
    const result = await finishDesktopXOAuthCallback({
      code: "auth_code_1",
      state
    }, {
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, authorization: options.headers?.Authorization || options.headers?.authorization || "" });
        if (String(url).endsWith("/oauth2/token")) {
          return jsonResponse({
            access_token: "access_token_should_stay_local",
            refresh_token: "refresh_token_should_stay_local",
            token_type: "bearer",
            expires_in: 7200
          });
        }
        if (String(url).endsWith("/users/me")) {
          return jsonResponse({ data: { id: "x_user_1", username: "guamee4", name: "guamee" } });
        }
        return jsonResponse({ error: "not found" }, 404);
      }
    });

    assert.equal(result.account.accountType, "official");
    assert.equal(result.account.handle, "@guamee4");
    assert.equal(result.account.connectionStatus, "connected");
    assert.equal(result.connection.tokenRef, "desktop-x-oauth");
    assert.equal(calls.length, 2);
    assert.match(calls[0].authorization, /^Basic /);

    const status = await loadDesktopXOAuthStatus();
    assert.equal(status.tokenStorage, "connected");
    assert.equal(status.authorizedHandle, "@guamee4");
    assert.equal(status.tokenStorageLabel, "已登录 @guamee4");
    assert.doesNotMatch(JSON.stringify(status), /access_token_should_stay_local|refresh_token_should_stay_local/);

    const runtimeConfig = JSON.parse(await readFile(path.join(dir, "data", "desktop-x-oauth.json"), "utf8"));
    assert.equal(runtimeConfig.authorizedAccountId, result.account.accountId);
    assert.equal(runtimeConfig.accessTokenRef, "access_token_should_stay_local");
  });
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
