import { spawnSync } from "node:child_process";

const action = process.argv[2] || "";

if (!["migrate", "seed"].includes(action)) {
  console.error("Usage: node scripts/app-d1-remote.mjs migrate|seed --yes");
  process.exit(1);
}

if (!process.argv.includes("--yes")) {
  console.error(`Refusing to ${action} remote staging D1 without --yes.`);
  console.error(`Run: npm run app:d1:${action}:staging -- --yes`);
  process.exit(1);
}

const command = action === "migrate"
  ? ["wrangler", "d1", "migrations", "apply", "ai_creator_os_app_staging", "--remote", "--env", "production", "--config", "wrangler.jsonc"]
  : ["wrangler", "d1", "execute", "ai_creator_os_app_staging", "--remote", "--env", "production", "--config", "wrangler.jsonc", "--file", "db/seed/app-staging-demo.sql"];

runWrangler(command);

function runWrangler(args) {
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
