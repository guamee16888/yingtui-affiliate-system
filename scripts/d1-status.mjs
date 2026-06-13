import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./lib/file-store.mjs";

const configPath = path.join(rootDir, "wrangler.jsonc");
const migrationsDir = path.join(rootDir, "db/migrations");
const localStateDir = path.join(rootDir, ".wrangler");

const status = {
  config: "missing",
  databaseName: "",
  binding: "",
  migrationsDir: "db/migrations",
  migrationCount: 0,
  localStateExists: false,
  storageModeDefault: "json",
  notes: [
    "D1 Local MVP only. These commands do not operate on remote D1 unless you remove --local.",
    "Static guamee.org and admin demo builds still use sanitized files, not D1 writes."
  ]
};

try {
  const text = await readFile(configPath, "utf8");
  status.config = "wrangler.jsonc";
  status.databaseName = text.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1] ?? "";
  status.binding = text.match(/"binding"\s*:\s*"([^"]+)"/)?.[1] ?? "";
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

try {
  const files = await readdir(migrationsDir);
  status.migrationCount = files.filter((file) => file.endsWith(".sql")).length;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

try {
  const info = await stat(localStateDir);
  status.localStateExists = info.isDirectory();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log("D1 local status");
console.log(`config: ${status.config}`);
console.log(`binding: ${status.binding || "(missing)"}`);
console.log(`database: ${status.databaseName || "(missing)"}`);
console.log(`migrations: ${status.migrationCount} file(s) in ${status.migrationsDir}`);
console.log(`local state: ${status.localStateExists ? "present" : "not created yet"}`);
console.log(`APP_STORAGE_MODE default: ${status.storageModeDefault}`);
for (const note of status.notes) console.log(`note: ${note}`);

try {
  await access(path.join(rootDir, "db/seed/from-json.sql"));
  console.log("from-json export: present (gitignored)");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.log("from-json export: not generated");
}
