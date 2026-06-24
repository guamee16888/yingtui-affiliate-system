import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "../lib/file-store.mjs";
import { loadJsonToD1Sources, mapJsonToD1Rows, rowsToSql } from "../lib/json-to-d1-mapper.mjs";

const args = new Set(process.argv.slice(2));
const exportPath = path.join(rootDir, "db/seed/from-json.sql");

if (args.has("--dry-run")) {
  const result = await build();
  printSummary(result.summary);
} else if (args.has("--export-sql")) {
  const result = await build();
  await mkdir(path.dirname(exportPath), { recursive: true });
  await writeFile(exportPath, rowsToSql(result.rows, { sanitize: true }), "utf8");
  printSummary(result.summary);
  console.log(`SQL export written to ${path.relative(rootDir, exportPath)}`);
  console.log("WARNING: This export may contain real operational data. Do not commit or deploy publicly.");
} else if (args.has("--import-local")) {
  await importLocal();
} else {
  console.log("Usage: node scripts/d1/migrate-json-to-d1.mjs --dry-run|--export-sql|--import-local");
  process.exitCode = 1;
}

async function build() {
  const source = await loadJsonToD1Sources();
  return mapJsonToD1Rows(source, { sanitize: true });
}

function printSummary(summary) {
  console.log("JSON -> D1 dry-run summary");
  console.log(`workspaces: ${summary.counts.workspaces}`);
  console.log(`users: ${summary.counts.users}`);
  console.log(`accounts: ${summary.counts.accounts}`);
  console.log(`tasks: ${summary.counts.tasks}`);
  console.log(`ledger: ${summary.counts.ledger}`);
  console.log(`feedback: ${summary.counts.feedback}`);
  console.log(`missing workspace_id: ${summary.missingWorkspaceIdCount}`);
  console.log(`unmapped records: ${summary.unmappedCount}`);
  console.log(`duplicate primary keys: ${summary.duplicatePrimaryKeyCount}`);
  if (summary.unmapped.length) {
    console.log("unmapped detail:");
    for (const item of summary.unmapped.slice(0, 20)) {
      console.log(`- ${item.table}: ${item.reason} (${item.id || "no id"})`);
    }
  }
}

async function importLocal() {
  let sql;
  try {
    sql = await readFile(exportPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Missing db/seed/from-json.sql. Run npm run d1:export-sql first.", { cause: error });
    }
    throw error;
  }
  if (!sql.includes("INSERT OR IGNORE")) {
    throw new Error("db/seed/from-json.sql does not look like an import file.");
  }

  console.log("Checking local D1 schema before import...");
  runWrangler([
    "wrangler",
    "d1",
    "execute",
    "ai_creator_os_local",
    "--local",
    "--config",
    "wrangler.jsonc",
    "--command",
    "SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces';"
  ], "Local D1 schema is not ready. Run npm run d1:migrate:local first.");

  console.log("Importing db/seed/from-json.sql into local D1 only...");
  runWrangler([
    "wrangler",
    "d1",
    "execute",
    "ai_creator_os_local",
    "--local",
    "--config",
    "wrangler.jsonc",
    "--file",
    "db/seed/from-json.sql"
  ], "Local D1 import failed.");
  console.log("Local D1 import complete. Remote D1 was not touched.");
}

function runWrangler(args, failureMessage) {
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.status !== 0) {
    throw new Error(failureMessage);
  }
}
