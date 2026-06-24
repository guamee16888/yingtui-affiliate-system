import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_LANES = [
  ["ai_startups", "AI startup circle", "AI product launches, operators, agents and automation"],
  ["indie_builders", "Indie builder circle", "Solo builders, small tools, launch notes and build-in-public ideas"],
  ["saas_founders", "SaaS founder circle", "B2B SaaS, growth, product operations and founder workflows"],
  ["crypto_builders", "Crypto builder circle", "Wallet UX, security, onchain data and crypto infrastructure"]
];

export function parseArgs(argv = []) {
  const args = {
    workspaceId: "",
    workspaceName: "",
    managerEmail: "",
    managerName: "",
    accountCount: 30,
    plan: "customer",
    requireDiscord: true,
    discordGuildId: "",
    discordRoleIds: [],
    yes: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = argv[index + 1] || "";
    if (key === "--workspace-id") args.workspaceId = next, index += 1;
    else if (key === "--workspace-name") args.workspaceName = next, index += 1;
    else if (key === "--manager-email") args.managerEmail = next, index += 1;
    else if (key === "--manager-name") args.managerName = next, index += 1;
    else if (key === "--accounts") args.accountCount = Number(next), index += 1;
    else if (key === "--plan") args.plan = next, index += 1;
    else if (key === "--discord-guild-id") args.discordGuildId = next, index += 1;
    else if (key === "--discord-role-ids") args.discordRoleIds = splitCsv(next), index += 1;
    else if (key === "--no-discord") args.requireDiscord = false;
    else if (key === "--yes") args.yes = true;
    else if (key === "--help" || key === "-h") args.help = true;
  }
  return normalizeArgs(args);
}

export function normalizeArgs(args) {
  const managerEmail = String(args.managerEmail || "").trim().toLowerCase();
  const workspaceName = String(args.workspaceName || "").trim();
  const workspaceId = normalizeId(args.workspaceId || workspaceName || managerEmail.split("@")[0], "workspace");
  const managerName = String(args.managerName || "").trim() || managerEmail || "Workspace Manager";
  const accountCount = Math.max(0, Math.min(30, Math.floor(Number(args.accountCount ?? 30))));
  return {
    ...args,
    workspaceId,
    workspaceName: workspaceName || workspaceId,
    managerEmail,
    managerName,
    accountCount,
    plan: String(args.plan || "customer").trim() || "customer"
  };
}

export function buildCustomerSql(input) {
  const args = normalizeArgs(input);
  if (!args.workspaceId) throw new Error("--workspace-id or --workspace-name is required.");
  if (!args.managerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.managerEmail)) {
    throw new Error("--manager-email must be a valid email.");
  }

  const now = new Date().toISOString();
  const managerUserId = normalizeId(args.managerEmail, "user");
  const lines = [
    "-- AI Creator OS customer workspace seed.",
    "BEGIN TRANSACTION;",
    insertOrReplace("workspaces", {
      workspace_id: args.workspaceId,
      name: args.workspaceName,
      plan: args.plan,
      account_limit: args.accountCount || 30,
      publish_mode: "manual",
      auto_publish_enabled: 0,
      requires_final_approval: 1,
      status: "active",
      created_at: now,
      updated_at: now
    }),
    insertOrReplace("users", {
      user_id: managerUserId,
      email: args.managerEmail,
      name: args.managerName,
      role: "manager",
      status: "active",
      created_at: now,
      updated_at: now
    }),
    insertOrReplace("workspace_members", {
      workspace_member_id: stableId("member", [args.workspaceId, managerUserId]),
      workspace_id: args.workspaceId,
      user_id: managerUserId,
      role: "manager",
      status: "active",
      created_at: now,
      updated_at: now
    })
  ];

  DEFAULT_LANES.forEach(([laneId, name, description], index) => {
    lines.push(insertOrIgnore("content_lanes", {
      lane_id: laneId,
      name,
      description,
      risk_policy: "conservative",
      active: 1,
      created_at: now,
      updated_at: now
    }));
    lines.push(insertOrReplace("workspace_lanes", {
      workspace_lane_id: stableId("workspace_lane", [args.workspaceId, laneId]),
      workspace_id: args.workspaceId,
      lane_id: laneId,
      enabled: 1,
      priority: (index + 1) * 10,
      monthly_quota: 0,
      created_at: now,
      updated_at: now
    }));
  });

  lines.push(insertOrReplace("publish_settings", {
    publish_settings_id: stableId("publish_settings", [args.workspaceId]),
    workspace_id: args.workspaceId,
    global_auto_publish_enabled: 0,
    dry_run_by_default: 1,
    require_approval_before_publish: 1,
    settings_json: "{}",
    created_at: now,
    updated_at: now
  }));
  lines.push(insertOrReplace("subscriptions", {
    subscription_id: stableId("subscription", [args.workspaceId]),
    workspace_id: args.workspaceId,
    plan: args.plan,
    status: "active",
    require_discord_verification: args.requireDiscord ? 1 : 0,
    required_discord_guild_id: args.discordGuildId || "",
    required_discord_role_ids_json: JSON.stringify(args.discordRoleIds || []),
    max_accounts: args.accountCount || 30,
    max_seats: 5,
    expires_at: "",
    created_at: now,
    updated_at: now
  }));

  for (let index = 1; index <= args.accountCount; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const accountId = `${args.workspaceId}_acct_${suffix}`;
    lines.push(insertOrReplace("x_accounts", {
      account_id: accountId,
      workspace_id: args.workspaceId,
      handle: "",
      persona: `Account ${suffix}`,
      niche: "Unassigned",
      status: "active",
      daily_post_limit: 10,
      external_link_limit: 1,
      manager_user_id: managerUserId,
      owner_user_id: managerUserId,
      created_at: now,
      updated_at: now
    }));
    lines.push(insertOrReplace("assignments", {
      assignment_id: stableId("assignment", [args.workspaceId, managerUserId, accountId]),
      workspace_id: args.workspaceId,
      user_id: managerUserId,
      account_id: accountId,
      active: 1,
      start_date: now.slice(0, 10),
      end_date: "",
      created_at: now,
      updated_at: now
    }));
    lines.push(insertOrReplace("x_connections", {
      connection_id: stableId("x_connection", [args.workspaceId, accountId]),
      workspace_id: args.workspaceId,
      account_id: accountId,
      x_user_id: "",
      handle: "",
      token_ref: "",
      status: "not_connected",
      scopes_json: "[]",
      last_verified_at: "",
      created_at: now,
      updated_at: now
    }));
  }

  lines.push(insertOrReplace("audit_logs", {
    audit_id: stableId("audit", [args.workspaceId, "customer.create", managerUserId, now]),
    workspace_id: args.workspaceId,
    actor_user_id: managerUserId,
    actor_role: "manager",
    action: "customer.create",
    entity_type: "workspace",
    entity_id: args.workspaceId,
    metadata_json: JSON.stringify({ accountCount: args.accountCount, managerEmail: args.managerEmail }),
    created_at: now
  }));
  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

function printHelp() {
  console.log(`Create a customer workspace in the remote app D1 database.

Usage:
  npm run app:customer:create -- --workspace-id workspace_acme --workspace-name "Acme Team" --manager-email owner@example.com --manager-name "Acme Owner" --accounts 30 --discord-guild-id 123 --discord-role-ids 456,789 --yes

Without --yes, the command prints SQL only.
You still need to allow the manager email in Cloudflare Access for app.guamee.org.
Discord verification is required by default. Use --no-discord only for a private internal workspace.`);
}

function runWrangler(sql) {
  const result = spawnSync("npx", [
    "wrangler",
    "d1",
    "execute",
    "ai_creator_os_app_staging",
    "--remote",
    "--env",
    "production",
    "--config",
    "wrangler.jsonc",
    "--command",
    sql
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

function insertOrReplace(table, row) {
  return insertStatement("INSERT OR REPLACE", table, row);
}

function insertOrIgnore(table, row) {
  return insertStatement("INSERT OR IGNORE", table, row);
}

function insertStatement(prefix, table, row) {
  const columns = Object.keys(row);
  const values = columns.map((column) => sqlValue(row[column]));
  return `${prefix} INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
}

function sqlValue(value) {
  if (typeof value === "number") return String(value);
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeId(value, prefix) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/@/g, "_at_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 54);
  return slug.startsWith(`${prefix}_`) ? slug : `${prefix}_${slug || "default"}`;
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function stableId(prefix, parts) {
  let hash = 2166136261;
  const raw = parts.map((part) => String(part ?? "")).join("::");
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
  } else {
    const sql = buildCustomerSql(args);
    if (!args.yes) {
      console.log(sql);
      console.log("Dry run only. Add --yes to write this customer workspace to remote D1.");
    } else {
      runWrangler(sql);
    }
  }
}
