import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeTweetLength } from "./lib/tweet-length.mjs";

const DEFAULT_ITEMS = [
  {
    suffix: "ai_ops",
    laneId: "ai_startups",
    accountIndex: 1,
    toolName: "AI Signal Desk",
    toolUrl: "",
    domain: "",
    tagline: "Turns AI product signals into a short review queue.",
    angle: "AI teams need fewer dashboards and better daily review queues.",
    variantType: "shortPost",
    copyText: "A lot of AI tools still feel like another inbox. The useful ones turn messy product signals into a short review queue your team can actually finish.",
    status: "pending_review",
    approvalStatus: "pending",
    notes: "Onboarding task: test approve flow."
  },
  {
    suffix: "unassigned",
    laneId: "indie_builders",
    accountIndex: 0,
    toolName: "Founder Validation Radar",
    toolUrl: "",
    domain: "",
    tagline: "Checks whether a small niche deserves a longer review.",
    angle: "Indie founders should test a narrow post before writing a full review page.",
    variantType: "casualPost",
    copyText: "Small founder lesson: before writing a giant review page, see if a plain post gets replies from the exact niche first.",
    status: "pending_review",
    approvalStatus: "pending",
    notes: "Onboarding task: intentionally unassigned so the manager can test Save assignment."
  },
  {
    suffix: "saas_ops",
    laneId: "saas_founders",
    accountIndex: 2,
    toolName: "SaaS Support Radar",
    toolUrl: "",
    domain: "",
    tagline: "Finds recurring customer pain points in support notes.",
    angle: "Support tickets reveal better founder content than feature lists.",
    variantType: "contrarianAngle",
    copyText: "Your best SaaS content ideas may already be hiding in support tickets. Product pages tell you what you sell; tickets tell you what people actually struggle with.",
    status: "pending_review",
    approvalStatus: "pending",
    notes: "Onboarding task: SaaS lane."
  },
  {
    suffix: "feedback",
    laneId: "ai_startups",
    accountIndex: 3,
    toolName: "Review Queue Notes",
    toolUrl: "",
    domain: "",
    tagline: "Keeps track of which posts need analytics feedback.",
    angle: "Feedback debt should stop teams from scaling weak content too early.",
    variantType: "painPointHook",
    copyText: "The hard part is not posting more. It is knowing which posts got real signal before the team turns a small test into a daily habit.",
    status: "feedback_due",
    approvalStatus: "approved",
    notes: "Onboarding task: test feedback save."
  },
  {
    suffix: "crypto_trust",
    laneId: "crypto_builders",
    accountIndex: 4,
    toolName: "Crypto Trust Checklist",
    toolUrl: "",
    domain: "",
    tagline: "Checks trust copy before wallet-adjacent product posts.",
    angle: "Crypto builder content needs trust signals before big promises.",
    variantType: "shortPost",
    copyText: "For crypto builder tools, trust copy matters more than hype copy. Show the permission, the failure mode, and the rollback path before the big promise.",
    status: "pending_review",
    approvalStatus: "pending",
    notes: "Onboarding task: crypto builder lane, no trading claims."
  }
];

export function parseArgs(argv = []) {
  const args = { workspaceId: "", managerUserId: "", yes: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = argv[index + 1] || "";
    if (key === "--workspace-id") args.workspaceId = next, index += 1;
    else if (key === "--manager-user-id") args.managerUserId = next, index += 1;
    else if (key === "--yes") args.yes = true;
    else if (key === "--help" || key === "-h") args.help = true;
  }
  return {
    ...args,
    workspaceId: String(args.workspaceId || "").trim(),
    managerUserId: String(args.managerUserId || "").trim()
  };
}

export function buildCustomerTaskSeedSql(input = {}) {
  const args = parseArgs([
    "--workspace-id",
    input.workspaceId || "",
    "--manager-user-id",
    input.managerUserId || ""
  ]);
  if (!args.workspaceId) throw new Error("--workspace-id is required.");
  if (!args.managerUserId) throw new Error("--manager-user-id is required.");

  const now = new Date().toISOString();
  const slug = normalizeId(args.workspaceId);
  const lines = [
    "-- AI Creator OS customer onboarding task seed.",
    "-- Safe rows only: no real X handles, no posted URLs, no tokens, no affiliate links.",
    "BEGIN TRANSACTION;"
  ];

  for (const item of DEFAULT_ITEMS) {
    const ids = idsFor(slug, item.suffix);
    const accountId = item.accountIndex
      ? `${args.workspaceId}_acct_${String(item.accountIndex).padStart(2, "0")}`
      : "";
    const assignedTo = item.accountIndex ? args.managerUserId : "";
    const length = analyzeTweetLength(item.copyText);
    if (!length.fitsXPost) throw new Error(`Seed copy is over 280 chars: ${item.suffix}`);

    lines.push(insertOrReplace("tools", {
      tool_id: ids.toolId,
      canonical_name: item.toolName,
      url: item.toolUrl,
      domain: item.domain,
      tagline: item.tagline,
      created_at: now,
      updated_at: now
    }));
    lines.push(insertOrReplace("topics", {
      topic_id: ids.topicId,
      workspace_id: args.workspaceId,
      tool_id: ids.toolId,
      lane_id: item.laneId,
      angle: item.angle,
      status: "ready",
      score: 80,
      created_at: now,
      updated_at: now
    }));
    lines.push(insertOrReplace("copy_library", {
      copy_id: ids.copyId,
      workspace_id: args.workspaceId,
      topic_id: ids.topicId,
      tool_id: ids.toolId,
      variant_type: item.variantType,
      copy_text: item.copyText,
      normalized_text_hash: stableId("hash", [args.workspaceId, item.copyText]),
      weighted_char_count: length.weightedCharCount,
      status: "ready",
      created_at: now,
      updated_at: now
    }));
    lines.push(insertOrReplace("post_tasks", {
      task_id: ids.taskId,
      workspace_id: args.workspaceId,
      account_id: accountId || null,
      assigned_to: assignedTo || null,
      manager_user_id: args.managerUserId,
      tool_id: ids.toolId,
      topic_id: ids.topicId,
      copy_id: ids.copyId,
      copy_text: item.copyText,
      status: item.status,
      approval_status: item.approvalStatus,
      weighted_char_count: length.weightedCharCount,
      duplicate_check_json: JSON.stringify({ riskLevel: "low", flags: [] }),
      risk_flags_json: "[]",
      notes: item.notes,
      created_at: now,
      updated_at: now
    }));
  }

  lines.push(insertOrReplace("audit_logs", {
    audit_id: stableId("audit", [args.workspaceId, "customer.seed_tasks", now]),
    workspace_id: args.workspaceId,
    actor_user_id: args.managerUserId,
    actor_role: "manager",
    action: "customer.seed_tasks",
    entity_type: "workspace",
    entity_id: args.workspaceId,
    metadata_json: JSON.stringify({ taskCount: DEFAULT_ITEMS.length }),
    created_at: now
  }));
  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

function printHelp() {
  console.log(`Seed safe onboarding tasks for a customer workspace.

Usage:
  npm run app:customer:seed-tasks -- --workspace-id workspace_client --manager-user-id user_client --yes

Without --yes, the command prints SQL only.`);
}

function runWrangler(sql) {
  const commandSql = sql
    .replace(/^--.*$/gm, "")
    .replace(/^BEGIN TRANSACTION;\s*$/gmi, "")
    .replace(/^COMMIT;\s*$/gmi, "")
    .trim();
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
    commandSql
  ], { stdio: "inherit", env: { ...process.env, NO_COLOR: "1" } });
  if (result.status !== 0) process.exit(result.status || 1);
}

function idsFor(workspaceSlug, suffix) {
  return {
    toolId: `tool_${workspaceSlug}_${suffix}`,
    topicId: `topic_${workspaceSlug}_${suffix}`,
    copyId: `copy_${workspaceSlug}_${suffix}`,
    taskId: `task_${workspaceSlug}_${suffix}`
  };
}

function insertOrReplace(table, row) {
  const columns = Object.keys(row);
  const values = columns.map((column) => sqlValue(row[column]));
  return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
}

function sqlValue(value) {
  if (typeof value === "number") return String(value);
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "workspace";
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
  } else {
    const sql = buildCustomerTaskSeedSql(args);
    if (args.yes) runWrangler(sql);
    else console.log(sql);
  }
}
