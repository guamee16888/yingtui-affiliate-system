import { readFile } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./lib/file-store.mjs";

const configPath = path.join(rootDir, "wrangler.jsonc");
const text = await readFile(configPath, "utf8");
const config = JSON.parse(text);
const localDb = config.d1_databases?.[0] || {};
const pagesEnv = config.env?.production || {};
const stagingDb = pagesEnv.d1_databases?.[0] || {};

console.log("App D1 staging status");
console.log(`local binding: ${localDb.binding || "(missing)"}`);
console.log(`local database: ${localDb.database_name || "(missing)"}`);
console.log(`staging worker: ${pagesEnv.name || "(missing)"}`);
console.log(`staging binding: ${stagingDb.binding || "(missing)"}`);
console.log(`staging database: ${stagingDb.database_name || "(missing)"}`);
console.log(`staging database_id: ${stagingDb.database_id || "(missing)"}`);
console.log(`APP_ENV: ${pagesEnv.vars?.APP_ENV || "(missing)"}`);
console.log(`APP_STORAGE_MODE: ${pagesEnv.vars?.APP_STORAGE_MODE || "(missing)"}`);
if (stagingDb.database_id === "<fill-after-create>") {
  console.log("note: create the staging D1 database, then replace <fill-after-create> with the real database_id.");
}
console.log("note: remote mutate commands require --yes.");
