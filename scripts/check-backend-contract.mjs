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
  "scripts/lib/d1-storage-adapter.stub.mjs"
];

const passed = [];
const errors = [];

for (const file of [...docs, ...requiredAdapterFiles]) {
  await mustExist(file);
}

const schema = await read("docs/backend/d1-schema.sql");
for (const table of requiredTables) {
  if (new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${table}\\b`, "i").test(schema)) passed.push(`D1 table exists: ${table}`);
  else errors.push(`Missing D1 table: ${table}`);
}

const api = await read("docs/backend/api-contract.md");
for (const word of ["admin", "manager", "staff", "/api/app/v1/admin", "/api/app/v1/manager", "/api/app/v1/staff"]) {
  mustInclude(api, word, "api-contract.md");
}

const auth = await read("docs/backend/auth-plan.md");
for (const word of ["admin", "manager", "staff", "Cloudflare Access", "ad.guamee.org", "app.guamee.org"]) {
  mustInclude(auth, word, "auth-plan.md");
}

const boundary = await read("docs/backend/data-boundary.md");
for (const word of ["guamee.org", "ad.guamee.org", "app.guamee.org", "demo", "workspace", "admin", "30"]) {
  mustInclude(boundary, word, "data-boundary.md");
}

const security = await read("docs/backend/security-checklist.md");
for (const word of ["token", "workspace", "demo", "280", "duplicate", ".env", "fake affiliate"]) {
  mustInclude(security, word, "security-checklist.md");
}

const pkg = JSON.parse(await read("package.json"));
for (const script of ["backend:contract", "admin:preflight", "verify:admin-access", "demo:sanitize", "build:public", "build:admin-demo", "build:demo", "release:check:public", "release:check:admin", "release:check"]) {
  if (pkg.scripts?.[script]) passed.push(`Package script exists: ${script}`);
  else errors.push(`Missing package script: ${script}`);
}

const readme = await read("README.md");
for (const word of ["guamee.org", "ad.guamee.org", "app.guamee.org"]) {
  mustInclude(readme, word, "README.md");
}

const d1Stub = await read("scripts/lib/d1-storage-adapter.stub.mjs");
mustInclude(d1Stub, "D1 adapter is not implemented yet.", "d1-storage-adapter.stub.mjs");
if (/wrangler|createClient|D1Database|process\.env/i.test(d1Stub)) errors.push("D1 stub must not connect to real D1 or environment secrets");
else passed.push("D1 adapter is a stub only");

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

function printReport() {
  console.log("Backend contract check");
  for (const line of passed) console.log(`✓ ${line}`);
  for (const line of errors) console.error(`✗ ${line}`);
}
