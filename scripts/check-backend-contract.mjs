import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./lib/file-store.mjs";

const docs = [
  "docs/backend/app-backend-contract.md",
  "docs/backend/data-boundary.md",
  "docs/backend/d1-schema.sql",
  "docs/backend/api-contract.md",
  "docs/backend/auth-plan.md",
  "docs/backend/json-to-d1-migration-plan.md",
  "docs/backend/security-checklist.md",
  "docs/backend/deployment-plan.md"
];

const d1Files = [
  "db/migrations/0001_initial.sql",
  "db/seed/demo.sql",
  "wrangler.jsonc",
  "scripts/lib/d1-storage-adapter.mjs",
  "scripts/lib/json-to-d1-mapper.mjs",
  "scripts/lib/app-storage-mode.mjs",
  "scripts/migrate-json-to-d1.mjs",
  "scripts/d1-status.mjs",
  "scripts/d1-reset-local.mjs"
];

const requiredTables = [
  "workspaces",
  "users",
  "workspace_members",
  "x_accounts",
  "assignments",
  "content_lanes",
  "workspace_lanes",
  "source_connectors",
  "source_feeds",
  "raw_candidates",
  "tools",
  "topics",
  "copy_library",
  "post_tasks",
  "post_ledger",
  "feedback",
  "publish_settings",
  "x_connections",
  "publish_jobs",
  "publish_attempts",
  "audit_logs",
  "api_events"
];

const requiredAdapterFiles = [
  "scripts/lib/storage-adapter.mjs",
  "scripts/lib/json-storage-adapter.mjs",
  "scripts/lib/d1-storage-adapter.mjs",
  "scripts/lib/json-to-d1-mapper.mjs",
  "scripts/lib/d1-storage-adapter.stub.mjs"
];

const passed = [];
const errors = [];

for (const file of [...docs, ...requiredAdapterFiles, ...d1Files]) {
  await mustExist(file);
}

const schema = await read("docs/backend/d1-schema.sql");
const migration = await read("db/migrations/0001_initial.sql");
for (const table of requiredTables) {
  if (new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${table}\\b`, "i").test(schema)) passed.push(`D1 table exists: ${table}`);
  else errors.push(`Missing D1 table: ${table}`);
  if (new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${table}\\b`, "i").test(migration)) passed.push(`Migration table exists: ${table}`);
  else errors.push(`Missing migration table: ${table}`);
}

for (const table of [
  "workspace_members",
  "x_accounts",
  "assignments",
  "workspace_lanes",
  "raw_candidates",
  "topics",
  "copy_library",
  "post_tasks",
  "post_ledger",
  "feedback",
  "publish_settings",
  "x_connections",
  "publish_jobs",
  "publish_attempts",
  "audit_logs",
  "api_events"
]) {
  const body = tableBody(migration, table);
  if (/workspace_id\s+TEXT/i.test(body)) passed.push(`${table} includes workspace_id`);
  else errors.push(`${table} missing workspace_id`);
}

for (const indexWord of ["workspace_id", "task_id", "account_id", "user_id", "status", "created_at"]) {
  if (new RegExp(`index[\\s\\S]+${indexWord}`, "i").test(migration)) passed.push(`Migration indexes ${indexWord}`);
  else errors.push(`Migration missing common index for ${indexWord}`);
}

const api = await read("docs/backend/api-contract.md");
for (const word of ["admin", "manager", "staff", "/api/app/v1/admin", "/api/app/v1/manager", "/api/app/v1/staff"]) {
  mustInclude(api, word, "api-contract.md");
}

const auth = await read("docs/backend/auth-plan.md");
for (const word of ["admin", "manager", "staff", "Cloudflare Access", "admin.guamee.org", "app.guamee.org"]) {
  mustInclude(auth, word, "auth-plan.md");
}

const boundary = await read("docs/backend/data-boundary.md");
for (const word of ["guamee.org", "admin.guamee.org", "app.guamee.org", "demo", "workspace", "admin", "30"]) {
  mustInclude(boundary, word, "data-boundary.md");
}

const security = await read("docs/backend/security-checklist.md");
for (const word of ["token", "workspace", "demo", "280", "duplicate", ".env", "fake affiliate"]) {
  mustInclude(security, word, "security-checklist.md");
}

const pkg = JSON.parse(await read("package.json"));
for (const script of [
  "backend:contract",
  "d1:status",
  "d1:migrate:local",
  "d1:seed:local",
  "d1:reset:local",
  "d1:migrate:dry-run",
  "d1:export-sql",
  "d1:import:local",
  "admin:preflight",
  "verify:admin-access",
  "demo:sanitize",
  "build:public",
  "build:admin-demo",
  "build:demo",
  "release:check:public",
  "release:check:admin",
  "release:check"
]) {
  if (pkg.scripts?.[script]) passed.push(`Package script exists: ${script}`);
  else errors.push(`Missing package script: ${script}`);
}

const readme = await read("README.md");
for (const word of ["guamee.org", "admin.guamee.org", "app.guamee.org", "D1 Local MVP"]) {
  mustInclude(readme, word, "README.md");
}

const d1Stub = await read("scripts/lib/d1-storage-adapter.stub.mjs");
mustInclude(d1Stub, "D1 adapter is not implemented yet.", "d1-storage-adapter.stub.mjs");
if (/wrangler|createClient|D1Database|process\.env/i.test(d1Stub)) errors.push("D1 stub must not connect to real D1 or environment secrets");
else passed.push("D1 adapter is a stub only");

const storageMode = await read("scripts/lib/app-storage-mode.mjs");
mustInclude(storageMode, 'DEFAULT_APP_STORAGE_MODE = "json"', "app-storage-mode.mjs");

const mapper = await read("scripts/lib/json-to-d1-mapper.mjs");
for (const word of ["mapJsonToD1Rows", "rowsToSql", "tokenRef", "posted_url"]) {
  mustInclude(mapper, word, "json-to-d1-mapper.mjs");
}

const gitTracked = gitLsFiles();
if (gitTracked.includes("db/seed/from-json.sql")) errors.push("db/seed/from-json.sql must not be git tracked");
else passed.push("db/seed/from-json.sql is not git tracked");

printReport();
if (errors.length) process.exitCode = 1;

async function mustExist(file) {
  try {
    await access(path.join(rootDir, file));
    passed.push(`File exists: ${file}`);
  } catch {
    errors.push(`Missing file: ${file}`);
  }
}

async function read(file) {
  try {
    return await readFile(path.join(rootDir, file), "utf8");
  } catch {
    return "";
  }
}

function mustInclude(text, needle, label) {
  if (text.includes(needle)) passed.push(`${label} includes ${needle}`);
  else errors.push(`${label} missing ${needle}`);
}

function tableBody(sql, table) {
  const match = sql.match(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table}\\s*\\(([\\s\\S]*?)\\);`, "i"));
  return match?.[1] ?? "";
}

function gitLsFiles() {
  try {
    return execFileSync("git", ["ls-files"], { cwd: rootDir, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function printReport() {
  console.log("Backend contract check");
  for (const line of passed) console.log(`✓ ${line}`);
  for (const line of errors) console.error(`✗ ${line}`);
}
