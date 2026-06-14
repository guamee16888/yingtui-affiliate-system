import { execFileSync } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
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
  "docs/backend/deployment-plan.md",
  "docs/deployment/app-cloudflare-staging.md",
  "docs/deployment/app-pages-project.md",
  "docs/deployment/app-access-d1-checklist.md"
];

const d1Files = [
  "db/migrations/0001_initial.sql",
  "db/migrations/0002_app_entitlements.sql",
  "db/seed/demo.sql",
  "wrangler.jsonc",
  "scripts/lib/d1-storage-adapter.mjs",
  "scripts/lib/json-to-d1-mapper.mjs",
  "scripts/lib/app-storage.mjs",
  "scripts/lib/app-storage-mode.mjs",
  "scripts/lib/app-api/session.mjs",
  "scripts/lib/app-api/auth-context.mjs",
  "scripts/lib/app-api/cloudflare-access-auth.mjs",
  "scripts/lib/app-api/discord-auth.mjs",
  "scripts/lib/app-api/discord-routes.mjs",
  "scripts/lib/app-api/workspace-scope.mjs",
  "scripts/lib/app-api/response.mjs",
  "scripts/lib/app-api/manager-routes.mjs",
  "scripts/lib/app-api/staff-routes.mjs",
  "scripts/migrate-json-to-d1.mjs",
  "scripts/d1-status.mjs",
  "scripts/d1-reset-local.mjs",
  "functions/api/app/v1/[[path]].mjs",
  "db/seed/app-staging-demo.sql",
  "scripts/seed-app-staging.mjs",
  "scripts/app-d1-status.mjs",
  "scripts/app-d1-create-staging.mjs",
  "scripts/app-d1-remote.mjs",
  "scripts/verify-app-staging.mjs"
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
  "api_events",
  "subscriptions",
  "user_identities",
  "license_events"
];

const requiredAdapterFiles = [
  "scripts/lib/storage-adapter.mjs",
  "scripts/lib/json-storage-adapter.mjs",
  "scripts/lib/d1-storage-adapter.mjs",
  "scripts/lib/app-storage.mjs",
  "scripts/lib/json-to-d1-mapper.mjs",
  "scripts/lib/d1-storage-adapter.stub.mjs"
];

const passed = [];
const errors = [];

for (const file of [...docs, ...requiredAdapterFiles, ...d1Files]) {
  await mustExist(file);
}

const schema = await read("docs/backend/d1-schema.sql");
const migration = await readMigrations();
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
  "api_events",
  "subscriptions",
  "license_events"
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
for (const word of [
  "admin",
  "manager",
  "staff",
  "/api/app/v1/session",
  "/api/app/v1/workspace",
  "/api/app/v1/admin",
  "/api/app/v1/manager",
  "/api/app/v1/staff",
  "/api/app/v1/manager/feedback",
  "workspace scope"
]) {
  mustInclude(api, word, "api-contract.md");
}

const auth = await read("docs/backend/auth-plan.md");
for (const word of ["admin", "manager", "staff", "Cloudflare Access", "admin.guamee.org", "app.guamee.org", "Discord"]) {
  mustInclude(auth, word, "auth-plan.md");
}

const boundary = await read("docs/backend/data-boundary.md");
for (const word of ["guamee.org", "admin.guamee.org", "app.guamee.org", "demo", "workspace", "admin", "30"]) {
  mustInclude(boundary, word, "data-boundary.md");
}

const security = await read("docs/backend/security-checklist.md");
for (const word of ["token", "workspace", "demo", "280", "duplicate", ".env", "fake affiliate", "Discord"]) {
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
  "app:d1:status",
  "app:d1:create:staging",
  "app:d1:migrate:staging",
  "app:d1:seed:staging",
  "app:seed:staging-sql",
  "admin:preflight",
  "verify:admin-access",
  "verify:app-staging",
  "demo:sanitize",
  "build:public",
  "build:admin-demo",
  "build:app",
  "build:demo",
  "release:check:public",
  "release:check:admin",
  "release:check:app",
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

const appStorage = await read("scripts/lib/app-storage.mjs");
mustInclude(appStorage, "APP_STORAGE_MODE=d1 requires a D1 binding", "app-storage.mjs");

const appApiSession = await read("scripts/lib/app-api/session.mjs");
for (const word of ["/api/app/v1/session", "/api/app/v1/workspace", "resolveStorage", "peekDiscordStateWorkspaceId"]) {
  mustInclude(appApiSession, word, "app-api/session.mjs");
}

const discordAuth = await read("scripts/lib/app-api/discord-auth.mjs");
for (const word of ["DISCORD_STATE_SECRET", "upsertUserIdentity", "guilds.members.read", "DISCORD_BOT_TOKEN"]) {
  mustInclude(discordAuth, word, "discord-auth.mjs");
}

const discordRoutes = await read("scripts/lib/app-api/discord-routes.mjs");
for (const word of ["auth/discord/status", "auth/discord/start", "auth/discord/callback"]) {
  mustInclude(discordRoutes, word, "discord-routes.mjs");
}

const appFunction = await read("functions/api/app/v1/[[path]].mjs");
for (const word of ["onRequest", "handleAppApiGet", "handleAppApiPost", "D1_BINDING_MISSING"]) {
  mustInclude(appFunction, word, "functions app route");
}

const accessAuth = await read("scripts/lib/app-api/cloudflare-access-auth.mjs");
for (const word of ["cf-access-jwt-assertion", "CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "RSASSA-PKCS1-v1_5"]) {
  if (accessAuth.toLowerCase().includes(word.toLowerCase())) passed.push(`cloudflare-access-auth includes ${word}`);
  else errors.push(`cloudflare-access-auth missing ${word}`);
}

const stagingSeed = await read("db/seed/app-staging-demo.sql");
for (const word of ["workspace_staging_demo", "INSERT OR REPLACE", "user_staging_manager"]) {
  mustInclude(stagingSeed, word, "app-staging-demo.sql");
}
if (/access_token|refresh_token|client_secret|api[_-]?key|bearer\s+[a-z0-9._-]+/i.test(stagingSeed)) {
  errors.push("app staging seed contains token-looking text");
} else {
  passed.push("app staging seed has no token-looking text");
}
if (/x\.com\/[^'"\s]+\/status\/\d+|twitter\.com\/[^'"\s]+\/status\/\d+|postedUrl/i.test(stagingSeed)) {
  errors.push("app staging seed contains posted URL text");
} else {
  passed.push("app staging seed has no posted URL text");
}

try {
  const wrangler = JSON.parse(await read("wrangler.jsonc"));
  const stagingDb = wrangler.env?.production?.d1_databases?.[0] || {};
  if (stagingDb.binding === "DB" && stagingDb.database_name === "ai_creator_os_app_staging") {
    passed.push("wrangler staging has DB binding");
  } else {
    errors.push("wrangler staging missing DB binding");
  }
  if (wrangler.env?.production?.vars?.APP_STORAGE_MODE === "d1") passed.push("wrangler staging APP_STORAGE_MODE=d1");
  else errors.push("wrangler staging APP_STORAGE_MODE must be d1");
} catch {
  errors.push("wrangler.jsonc is not valid JSON");
}

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

async function readMigrations() {
  try {
    const dir = path.join(rootDir, "db/migrations");
    const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
    const contents = await Promise.all(files.map((file) => readFile(path.join(dir, file), "utf8")));
    return contents.join("\n\n");
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
