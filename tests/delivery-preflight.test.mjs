import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryPreflightReport,
  isPrivateEnvFile
} from "../scripts/ops/delivery-preflight.mjs";

test("delivery preflight allows .env.example but blocks private env files", () => {
  assert.equal(isPrivateEnvFile(".env.example"), false);
  assert.equal(isPrivateEnvFile(".env"), true);
  assert.equal(isPrivateEnvFile(".env.local"), true);

  const report = buildDeliveryPreflightReport({
    trackedFiles: [".env.example", "package.json"],
    stagedFiles: [],
    changedFiles: [],
    envFiles: [],
    envKeys: [],
    sourceArchiveFiles: [],
    openClawRuntimeFiles: [],
    runtimeSections: [],
    browserRuntimeFiles: [],
    trackedSecretFiles: [],
    appDataDir: "/tmp/AI Creator OS"
  });

  assert.equal(report.errors.length, 0);
  assert.ok(report.ok.some((line) => line.includes(".env.example")));
});

test("delivery preflight blocks staged runtime paths and secret-like tracked files", () => {
  const report = buildDeliveryPreflightReport({
    trackedFiles: [".env.example", "scripts/example.mjs"],
    stagedFiles: ["data/latest.json", "output/report.md"],
    changedFiles: ["data/latest.json"],
    envFiles: [".env"],
    envKeys: ["ZHIPUAI_API_KEY"],
    sourceArchiveFiles: [],
    openClawRuntimeFiles: ["data/openclaw-source-hunter-latest.json"],
    runtimeSections: ["data"],
    browserRuntimeFiles: ["Cookies"],
    trackedSecretFiles: ["scripts/example.mjs"],
    appDataDir: "/tmp/AI Creator OS"
  });

  assert.ok(report.errors.some((line) => line.includes("Private runtime/build paths are staged")));
  assert.ok(report.errors.some((line) => line.includes("Secret-like values")));
  assert.ok(report.warnings.some((line) => line.includes("Local runtime data is modified")));
  assert.ok(report.warnings.some((line) => line.includes("OpenClaw runtime")));
});
