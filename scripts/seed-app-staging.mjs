import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_SEED_PATH = "db/seed/app-staging-demo.sql";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function validateAppStagingSeed({ filePath = path.join(rootDir, STAGING_SEED_PATH) } = {}) {
  const sql = await readFile(filePath, "utf8");
  const errors = [];
  const warnings = [];

  if (!sql.includes("workspace_staging_demo")) errors.push("staging seed missing workspace_staging_demo");
  if (!/INSERT\s+OR\s+REPLACE/i.test(sql)) errors.push("staging seed must be idempotent with INSERT OR REPLACE");
  if (/access_token|refresh_token|client_secret|api[_-]?key|bearer\s+[a-z0-9._-]+/i.test(sql)) errors.push("staging seed contains token-looking text");
  if (/posted_url\s*[,)]|postedUrl|x\.com\/[^'\"\\s]+\/status\/\d+|twitter\.com\/[^'\"\\s]+\/status\/\d+/i.test(sql)) errors.push("staging seed must not include postedUrl or posted X URLs");
  if (/affiliate(Link|Url)|partnerstack|impact\.com|rewardful/i.test(sql)) errors.push("staging seed must not include affiliate links");
  if (/https?:\/\/(?!example\.invalid)[^'\"\\s)]+/i.test(sql)) warnings.push("staging seed contains a non-example URL");
  if (!sql.includes("Zh697631@gmail.com")) warnings.push("manager Access email placeholder is not present");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: {
      workspaces: countInsertValues(sql, "workspaces"),
      users: countInsertValues(sql, "users"),
      accounts: countInsertValues(sql, "x_accounts"),
      tasks: countInsertValues(sql, "post_tasks")
    }
  };
}

function countInsertValues(sql, table) {
  const prefixByTable = {
    workspaces: "workspace_staging_demo",
    users: "user_staging_",
    x_accounts: "acct_staging_",
    post_tasks: "task_staging_"
  };
  const prefix = prefixByTable[table];
  if (prefix) return new Set([...sql.matchAll(new RegExp(`'(${prefix}[^']*)'`, "g"))].map((match) => match[1])).size;
  const match = sql.match(new RegExp(`INSERT\\s+OR\\s+REPLACE\\s+INTO\\s+${table}[\\s\\S]*?;`, "i"));
  if (!match) return 0;
  return (match[0].match(/\),/g) || []).length + 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateAppStagingSeed();
  console.log("App staging seed check");
  console.log(`workspaces: ${result.counts.workspaces}`);
  console.log(`users: ${result.counts.users}`);
  console.log(`accounts: ${result.counts.accounts}`);
  console.log(`tasks: ${result.counts.tasks}`);
  for (const warning of result.warnings) console.log(`warning: ${warning}`);
  for (const error of result.errors) console.error(`error: ${error}`);
  if (result.ok) console.log(`seed SQL is safe: ${STAGING_SEED_PATH}`);
  else process.exitCode = 1;
}
