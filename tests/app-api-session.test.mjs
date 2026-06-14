import assert from "node:assert/strict";
import test from "node:test";
import { getAuthContext } from "../scripts/lib/app-api/auth-context.mjs";
import { createDiscordAuthorizationUrl } from "../scripts/lib/app-api/discord-auth.mjs";
import { handleAppApiGet } from "../scripts/lib/app-api/session.mjs";

test("unauthenticated app API returns UNAUTHENTICATED", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session"), { collections: fixtures() }),
    (error) => error.code === "UNAUTHENTICATED"
  );
});

test("devEmail local mode can create a session", async () => {
  const result = await handleAppApiGet({
    request: request("/api/app/v1/session?devEmail=owner@guamee.local"),
    url: url("/api/app/v1/session?devEmail=owner@guamee.local"),
    options: { storage: fakeStorage(), collections: fixtures(), env: {} }
  });
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.data.userId, "user_owner");
  assert.equal(result.payload.data.workspaceId, "workspace_default");
  assert.equal(result.payload.data.isDev, true);
});

test("production mode rejects devEmail", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session?devEmail=owner@guamee.local"), {
      collections: fixtures(),
      env: { NODE_ENV: "production" }
    }),
    (error) => error.code === "DEV_EMAIL_DISABLED"
  );
});

test("Cloudflare Access email resolves user and workspace", async () => {
  const context = await getAuthContext(request("/api/app/v1/session", {
    "cf-access-authenticated-user-email": "manager@example.com"
  }), { collections: fixtures(), env: {} });
  assert.equal(context.email, "manager@example.com");
  assert.equal(context.userId, "manager_a");
  assert.equal(context.role, "manager");
  assert.deepEqual(context.workspaceIds, ["workspace_a"]);
});

test("workspace can require Discord verification before app data access", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session", {
      "cf-access-authenticated-user-email": "manager@example.com"
    }), { collections: fixtures({
      subscriptions: [{
        workspaceId: "workspace_a",
        status: "active",
        requireDiscordVerification: true,
        requiredDiscordGuildId: "guild_1",
        requiredDiscordRoleIds: ["role_1"]
      }],
      userIdentities: []
    }), env: {} }),
    (error) => {
      assert.equal(error.code, "DISCORD_VERIFICATION_REQUIRED");
      assert.equal(error.details.requiredGuildId, "guild_1");
      assert.deepEqual(error.details.requiredRoleIds, ["role_1"]);
      return true;
    }
  );
});

test("verified Discord identity satisfies workspace entitlement", async () => {
  const context = await getAuthContext(request("/api/app/v1/session", {
    "cf-access-authenticated-user-email": "manager@example.com"
  }), { collections: fixtures({
    subscriptions: [{
      workspaceId: "workspace_a",
      status: "active",
      requireDiscordVerification: true,
      requiredDiscordGuildId: "guild_1",
      requiredDiscordRoleIds: ["role_1"]
    }],
    userIdentities: [{
      userId: "manager_a",
      provider: "discord",
      providerUserId: "discord_1",
      username: "Manager",
      guildId: "guild_1",
      roleIds: ["role_1"],
      status: "verified",
      verifiedAt: "2026-06-14T00:00:00.000Z"
    }]
  }), env: {} });
  assert.equal(context.discord.required, true);
  assert.equal(context.discord.verified, true);
});

test("Discord authorization uses bot-backed scope when a bot token can check roles", async () => {
  const authorizationUrl = await createDiscordAuthorizationUrl({
    env: {
      DISCORD_CLIENT_ID: "client_1",
      DISCORD_REQUIRED_GUILD_ID: "guild_1",
      DISCORD_BOT_TOKEN: "bot_token",
      DISCORD_STATE_SECRET: "state_secret"
    },
    url: url("/api/app/v1/auth/discord/start?workspaceId=workspace_a"),
    context: { userId: "manager_a", workspaceId: "workspace_a" }
  });
  assert.equal(new URL(authorizationUrl).searchParams.get("scope"), "identify");
});

test("Discord callback resolves the workspace from signed state", async () => {
  const authorizationUrl = await createDiscordAuthorizationUrl({
    env: {
      DISCORD_CLIENT_ID: "client_1",
      DISCORD_REQUIRED_GUILD_ID: "guild_1",
      DISCORD_BOT_TOKEN: "bot_token",
      DISCORD_STATE_SECRET: "state_secret"
    },
    url: url("/api/app/v1/auth/discord/start?workspaceId=workspace_b"),
    context: { userId: "manager_a", workspaceId: "workspace_b" }
  });
  const state = new URL(authorizationUrl).searchParams.get("state");
  const storage = fakeStorage();
  const result = await handleAppApiGet({
    request: request(`/api/app/v1/auth/discord/callback?code=ok&state=${encodeURIComponent(state)}`, {
      "cf-access-authenticated-user-email": "manager@example.com"
    }),
    url: url(`/api/app/v1/auth/discord/callback?code=ok&state=${encodeURIComponent(state)}`),
    options: {
      storage,
      collections: fixtures({
        workspaces: [
          { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: [], active: true },
          { workspaceId: "workspace_b", name: "Workspace B", managerUserIds: ["manager_a"], staffUserIds: [], active: true }
        ]
      }),
      env: {
        DISCORD_CLIENT_ID: "client_1",
        DISCORD_CLIENT_SECRET: "secret_1",
        DISCORD_REQUIRED_GUILD_ID: "guild_1",
        DISCORD_REQUIRED_ROLE_IDS: "role_1",
        DISCORD_BOT_TOKEN: "bot_token",
        DISCORD_STATE_SECRET: "state_secret"
      },
      fetchImpl: fakeDiscordFetch()
    }
  });
  assert.equal(result.response.status, 302);
  assert.equal(storage.lastIdentity.userId, "manager_a");
  assert.equal(storage.lastIdentity.guildId, "guild_1");
  assert.deepEqual(storage.lastIdentity.roleIds, ["role_1"]);
  assert.equal(storage.lastActor.workspaceId, "workspace_b");
});

function request(pathname, headers = {}) {
  return { url: pathname, headers };
}

function url(pathname) {
  return new URL(pathname, "http://localhost");
}

function fixtures(overrides = {}) {
  return {
    users: [
      { userId: "user_owner", name: "Owner", role: "admin", active: true, workspaceId: "workspace_default" },
      { userId: "manager_a", email: "manager@example.com", name: "Manager A", role: "manager", active: true, workspaceId: "workspace_a" }
    ],
    workspaces: [
      { workspaceId: "workspace_default", name: "Default", managerUserIds: ["user_owner"], staffUserIds: ["user_owner"], active: true },
      { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: [], active: true }
    ],
    assignments: [],
    xAccounts: [],
    subscriptions: [],
    userIdentities: [],
    ...overrides
  };
}

function fakeStorage() {
  const storage = {
    lastIdentity: null,
    lastActor: null,
    async getWorkspace(workspaceId) {
      return { workspaceId, name: "Default", accountLimit: 30, enabledLaneIds: [], publishMode: "manual", autoPublishEnabled: false, requiresFinalApproval: true };
    },
    async listWorkspaceTasks() {
      return [];
    },
    async listStaffTasks() {
      return [];
    },
    async updateTaskStatus() {
      return {};
    },
    async appendLedgerEntry() {
      return {};
    },
    async upsertFeedback() {
      return {};
    },
    async writeAuditLog() {
      return {};
    },
    async upsertUserIdentity(identity, actor) {
      storage.lastIdentity = identity;
      storage.lastActor = actor;
      return identity;
    }
  };
  return storage;
}

function fakeDiscordFetch() {
  return async (resource) => {
    const target = String(resource);
    if (target.endsWith("/oauth2/token")) {
      return jsonResponse({ access_token: "access_1", token_type: "Bearer" });
    }
    if (target.endsWith("/users/@me")) {
      return jsonResponse({ id: "discord_1", username: "manager" });
    }
    if (target.includes("/users/@me/guilds/")) {
      return jsonResponse({ message: "Missing access" }, 403);
    }
    if (target.includes("/guilds/guild_1/members/discord_1")) {
      return jsonResponse({ roles: ["role_1"] });
    }
    return jsonResponse({ message: "Not found" }, 404);
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
