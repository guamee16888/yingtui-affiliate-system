import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const databaseName = "ai_creator_os_local";
const configPath = "wrangler.jsonc";
const tables = [
  "api_events",
  "audit_logs",
  "publish_attempts",
  "publish_jobs",
  "x_connections",
  "publish_settings",
  "feedback",
  "post_ledger",
  "post_tasks",
  "copy_library",
  "topics",
  "tools",
  "raw_candidates",
  "source_feeds",
  "source_connectors",
  "workspace_lanes",
  "content_lanes",
  "assignments",
  "x_accounts",
  "workspace_members",
  "users",
  "workspaces"
];

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "ai-creator-os-d1-reset-"));
const resetPath = path.join(tmpDir, "reset.sql");

try {
  const sql = [
    "PRAGMA foreign_keys = OFF;",
    ...tables.map((table) => `DROP TABLE IF EXISTS ${table};`),
    "DROP TABLE IF EXISTS d1_migrations;",
    "PRAGMA foreign_keys = ON;"
  ].join("\n");
  await writeFile(resetPath, `${sql}\n`, "utf8");
  run(["wrangler", "d1", "execute", databaseName, "--local", "--config", configPath, "--file", resetPath]);
  run(["wrangler", "d1", "migrations", "apply", databaseName, "--local", "--config", configPath]);
  console.log("Local D1 reset complete. Remote D1 was not touched.");
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: npx ${args.join(" ")}`);
  }
}
