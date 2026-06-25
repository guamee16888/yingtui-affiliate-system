import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildD1CandidateProductionPlan, buildLocalCandidateRawRows } from "../lib/app-candidate-production.mjs";
import { readJson } from "../lib/file-store.mjs";
import { loadContentSourceConfig, loadSourceCandidates, refreshSourceCandidates } from "../lib/content-source-system.mjs";
import { todayString } from "../lib/ids.mjs";

const REMOTE_DB_ARGS = [
  "wrangler",
  "d1",
  "execute",
  "ai_creator_os_app_staging",
  "--remote",
  "--env",
  "production",
  "--config",
  "wrangler.jsonc"
];

export function parseArgs(argv = []) {
  const args = {
    workspaceId: "",
    date: todayString(),
    limit: 20,
    rawLimit: 80,
    refreshSources: true,
    yes: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = argv[index + 1] || "";
    if (key === "--workspace-id" || key === "--workspace") args.workspaceId = next, index += 1;
    else if (key === "--date") args.date = next, index += 1;
    else if (key === "--limit") args.limit = Number(next), index += 1;
    else if (key === "--raw-limit") args.rawLimit = Number(next), index += 1;
    else if (key === "--no-refresh") args.refreshSources = false;
    else if (key === "--yes") args.yes = true;
    else if (key === "--help" || key === "-h") args.help = true;
  }
  return {
    ...args,
    workspaceId: String(args.workspaceId || "").trim(),
    date: String(args.date || todayString()).trim() || todayString(),
    limit: Math.max(0, Math.min(100, Math.floor(Number(args.limit || 20)))),
    rawLimit: Math.max(0, Math.min(300, Math.floor(Number(args.rawLimit || 80))))
  };
}

export async function buildProductionSqlForRemote(args = {}) {
  if (!args.workspaceId) throw new Error("--workspace-id is required.");
  const warnings = [];
  const [localRawCandidates, contentSourceConfig] = await Promise.all([
    readJson("data/raw-candidates.json", { items: [] }),
    loadContentSourceConfig(warnings)
  ]);
  const sourceRefresh = args.refreshSources
    ? await refreshSourceCandidates(contentSourceConfig, warnings)
    : {
      fetchedCount: 0,
      cachedCount: (await loadSourceCandidates()).items?.length ?? 0,
      enabledSources: 0,
      sourceCandidates: await loadSourceCandidates()
    };

  const localRows = buildLocalCandidateRawRows({
    rawCandidates: localRawCandidates.items || [],
    sourceCandidates: sourceRefresh.sourceCandidates.items || [],
    workspaceId: args.workspaceId,
    limit: args.rawLimit
  });
  const d1 = await readRemoteD1(args.workspaceId);
  const plan = buildD1CandidateProductionPlan({
    workspaceId: args.workspaceId,
    date: args.date,
    limit: args.limit,
    importRows: localRows.rows,
    d1
  });

  return {
    ...plan,
    warnings,
    sourceRefresh,
    localRows: localRows.stats
  };
}

function printHelp() {
  console.log(`Import real candidates into remote D1 and convert them into customer manager tasks.

Usage:
  npm run app:candidates:produce -- --workspace-id workspace_guamee_protonmail --limit 20 --yes

Options:
  --workspace-id <id>  Required customer workspace.
  --limit <n>         Max new post_tasks to create. Default 20.
  --raw-limit <n>     Max local candidates to sync into raw_candidates. Default 80.
  --date <YYYY-MM-DD> Task id date bucket. Default today.
  --no-refresh        Use cached data/source-candidates.json instead of refreshing enabled sources.
  --yes               Write to remote D1. Without this, prints a dry-run SQL preview only.

This command does not publish to X.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = await buildProductionSqlForRemote(args);
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  console.log("App candidate production");
  console.log(`- Workspace: ${result.stats.workspaceId}`);
  console.log(`- Source refresh: fetched ${result.sourceRefresh.fetchedCount}, cached ${result.sourceRefresh.cachedCount}, enabled ${result.sourceRefresh.enabledSources}`);
  console.log(`- Local candidates scanned: ${result.localRows.scanned}`);
  console.log(`- Raw rows prepared: ${result.localRows.rows}`);
  console.log(`- Raw imported: ${result.stats.importedRawCandidates}`);
  console.log(`- Tasks added: ${result.stats.tasksAdded}`);
  console.log(`- Tools/topics/copies added: ${result.stats.toolsAdded}/${result.stats.topicsAdded}/${result.stats.copiesAdded}`);
  console.log(`- Skipped existing raw/task: ${result.stats.skippedExistingRaw}/${result.stats.skippedExistingTask}`);
  console.log(`- Skipped lane/risk/placeholder: ${result.stats.skippedNoWorkspaceLane}/${result.stats.skippedRisk}/${result.stats.skippedPlaceholder}`);
  console.log(`- Blocked/warning tasks: ${result.stats.blockedTasks}/${result.stats.warningTasks}`);

  if (!result.statements.length) {
    console.log("No SQL changes needed.");
    return;
  }

  if (!args.yes) {
    console.log("\nDry run only. Add --yes to write these rows to remote D1.\n");
    console.log(result.sql);
    return;
  }

  executeRemoteSql(result.statements);
  console.log("Remote D1 candidate production complete.");
}

function readRemoteD1(workspaceId) {
  const sql = [
    `SELECT * FROM workspaces WHERE workspace_id = ${sqlValue(workspaceId)};`,
    `SELECT * FROM workspace_lanes WHERE workspace_id = ${sqlValue(workspaceId)};`,
    `SELECT * FROM workspace_members WHERE workspace_id = ${sqlValue(workspaceId)};`,
    `SELECT * FROM users;`,
    `SELECT * FROM x_accounts WHERE workspace_id = ${sqlValue(workspaceId)} ORDER BY account_id;`,
    `SELECT * FROM assignments WHERE workspace_id = ${sqlValue(workspaceId)} ORDER BY assignment_id;`,
    `SELECT * FROM raw_candidates WHERE workspace_id IS NULL OR workspace_id = ${sqlValue(workspaceId)} ORDER BY created_at DESC LIMIT 500;`,
    `SELECT * FROM tools ORDER BY updated_at DESC LIMIT 1000;`,
    `SELECT * FROM topics WHERE workspace_id = ${sqlValue(workspaceId)} ORDER BY updated_at DESC LIMIT 1000;`,
    `SELECT * FROM copy_library WHERE workspace_id = ${sqlValue(workspaceId)} ORDER BY updated_at DESC LIMIT 1000;`,
    `SELECT * FROM post_tasks WHERE workspace_id = ${sqlValue(workspaceId)} ORDER BY updated_at DESC LIMIT 2000;`,
    `SELECT * FROM post_ledger WHERE workspace_id = ${sqlValue(workspaceId)} ORDER BY updated_at DESC LIMIT 2000;`
  ].join("\n");
  const output = runWranglerJson(["--command", sql]);
  return {
    workspaces: output[0]?.results || [],
    workspaceLanes: output[1]?.results || [],
    workspaceMembers: output[2]?.results || [],
    users: output[3]?.results || [],
    xAccounts: output[4]?.results || [],
    assignments: output[5]?.results || [],
    rawCandidates: output[6]?.results || [],
    tools: output[7]?.results || [],
    topics: output[8]?.results || [],
    copyLibrary: output[9]?.results || [],
    postTasks: output[10]?.results || [],
    postLedger: output[11]?.results || []
  };
}

function executeRemoteSql(statements) {
  const chunks = chunk(statements, 40);
  chunks.forEach((items, index) => {
    console.log(`Writing D1 chunk ${index + 1}/${chunks.length} (${items.length} statements)...`);
    runWranglerJson(["--command", items.join("\n")]);
  });
}

function runWranglerJson(args) {
  const result = spawnSync("npx", [...REMOTE_DB_ARGS, "--json", ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.status !== 0) {
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status || 1);
  }
  try {
    return JSON.parse(result.stdout || "[]");
  } catch (error) {
    throw new Error(`Could not parse wrangler JSON output: ${error.message}`, { cause: error });
  }
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`App candidate production failed: ${error.message}`);
    process.exit(1);
  });
}
