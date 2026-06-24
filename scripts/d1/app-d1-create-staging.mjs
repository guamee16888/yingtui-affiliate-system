import { spawnSync } from "node:child_process";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to create remote D1 without --yes.");
  console.error("Run: npm run app:d1:create:staging -- --yes");
  process.exit(1);
}

runWrangler(["wrangler", "d1", "create", "ai_creator_os_app_staging", "--config", "wrangler.jsonc"]);

function runWrangler(args) {
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
