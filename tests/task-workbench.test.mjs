import assert from "node:assert/strict";
import test from "node:test";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { readJson } from "../scripts/lib/file-store.mjs";
import { updateManagerTaskAction } from "../scripts/lib/manager-system.mjs";
import {
  completeDesktopSetup,
  createDesktopTask,
  DESKTOP_X_CREDENTIALS_PATH,
  finishDesktopXOAuthCallback,
  importDesktopAccounts,
  markDesktopTaskPosted,
  publishDesktopTaskToX,
  saveDesktopXOAuthConfig,
  startDesktopXOAuth
} from "../scripts/lib/storage/interface.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop task workbench creates and marks manual post tasks", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_task", workspaceName: "Task Test" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_task", text: "@task_account" });
    const accountId = imported.imported[0].accountId;
    const created = await createDesktopTask({
      workspaceId: "workspace_task",
      accountId,
      assignedTo: "user_owner",
      copyText: "Small teams do not need more content tools. They need a cleaner way to decide what is worth posting today."
    });
    assert.equal(created.task.status, "pending_review");
    assert.equal(created.task.fitsTweetLimit, true);

    const posted = await markDesktopTaskPosted({ taskId: created.task.taskId, postedUrl: "https://x.com/example/status/1" });
    assert.equal(posted.task.status, "feedback_due");
    assert.equal(posted.ledger.publishMode, "manual");
  });
});

test("desktop task workbench rejects over 280 weighted characters", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_long", workspaceName: "Long Test" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_long", text: "@long_account" });
    await assert.rejects(
      createDesktopTask({
        workspaceId: "workspace_long",
        accountId: imported.imported[0].accountId,
        copyText: "x".repeat(281)
      }),
      /weighted characters/
    );
  });
});

test("desktop task workbench publishes approved task with account vault token", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_publish", workspaceName: "Publish Test" });
    await saveDesktopXOAuthConfig({
      clientId: "client_1234567890",
      clientSecret: "secret_abcdefghijklmnopqrstuvwxyz",
      callbackUrl: "http://127.0.0.1:5288/api/oauth/x/callback",
      scopes: "tweet.read tweet.write users.read offline.access"
    });
    const start = await startDesktopXOAuth();
    const state = new URL(start.authorizationUrl).searchParams.get("state");
    const callback = await finishDesktopXOAuthCallback({ code: "auth_code_1", state }, {
      fetchImpl: async (url) => {
        if (String(url).endsWith("/oauth2/token")) {
          return jsonResponse({
            access_token: "expired_access_token",
            refresh_token: "refresh_token_1",
            token_type: "bearer",
            expires_in: -10
          });
        }
        if (String(url).endsWith("/users/me")) {
          return jsonResponse({ data: { id: "x_user_1", username: "publish_account", name: "Publish Account" } });
        }
        return jsonResponse({ error: "not found" }, 404);
      }
    });
    const created = await createDesktopTask({
      workspaceId: "workspace_publish",
      accountId: callback.account.accountId,
      assignedTo: "user_owner",
      copyText: "A tiny operating loop beats a giant dashboard when the next action is always clear."
    });
    await updateManagerTaskAction({
      action: "approve",
      taskId: created.task.taskId,
      workspaceId: "workspace_publish",
      managerUserId: "user_owner"
    });

    const calls = [];
    const published = await publishDesktopTaskToX({ taskId: created.task.taskId }, { userId: "user_owner" }, {
      now: new Date("2099-06-20T08:00:00.000Z"),
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), authorization: options.headers?.authorization || options.headers?.Authorization || "", body: options.body ? String(options.body) : "" });
        if (String(url).endsWith("/oauth2/token")) {
          return jsonResponse({
            access_token: "fresh_access_token",
            refresh_token: "fresh_refresh_token",
            token_type: "bearer",
            expires_in: 7200
          });
        }
        if (String(url).endsWith("/2/tweets")) {
          assert.equal(options.headers.authorization, "Bearer fresh_access_token");
          assert.match(String(options.body), /tiny operating loop/);
          return jsonResponse({ data: { id: "tweet_123", text: "posted" } });
        }
        return jsonResponse({ error: "not found" }, 404);
      }
    });

    assert.equal(published.task.status, "feedback_due");
    assert.equal(published.task.publishMode, "x_api");
    assert.equal(published.xPostId, "tweet_123");
    assert.equal(published.ledger.publishMode, "x_api");
    assert.equal(calls.length, 2);

    const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
    assert.equal(tasks.items.find((task) => task.taskId === created.task.taskId).status, "feedback_due");
    const credentials = await readJson(DESKTOP_X_CREDENTIALS_PATH, {});
    assert.equal(credentials.byAccountId[callback.account.accountId].accessTokenRef, "fresh_access_token");
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
