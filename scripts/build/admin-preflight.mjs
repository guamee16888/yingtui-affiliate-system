import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  ["run", "build:admin-demo"],
  ["run", "release:check:admin"],
  ["run", "backend:contract"],
  ["run", "check"],
  ["test"],
  ["audit", "--audit-level=moderate"]
];

for (const args of steps) {
  const label = `npm ${args.join(" ")}`;
  console.log(`\n$ ${label}`);
  const result = spawnSync(npmCommand, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env
  });
  if (result.status !== 0) {
    console.error(`Admin preflight failed at: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\nAdmin preflight passed");
