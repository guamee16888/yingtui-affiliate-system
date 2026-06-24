import assert from "node:assert/strict";
import test from "node:test";
import { collectDesktopDoctorChecks, DESKTOP_DOCTOR_REQUIRED_FILES } from "../scripts/desktop/desktop-doctor.mjs";

test("desktop doctor checks the runtime stabilization files", () => {
  assert.ok(DESKTOP_DOCTOR_REQUIRED_FILES.includes("scripts/desktop/desktop-dev.mjs"));
  assert.ok(DESKTOP_DOCTOR_REQUIRED_FILES.includes("scripts/desktop/desktop-health-check.mjs"));
  assert.ok(DESKTOP_DOCTOR_REQUIRED_FILES.includes("desktop/main.mjs"));
});

test("desktop doctor can inspect critical files without starting Electron", async () => {
  const result = await collectDesktopDoctorChecks({
    cwd: process.cwd(),
    startTemporaryBackend: false
  });
  assert.equal(result.ok, true, result.checks.map((check) => `${check.level} ${check.message}`).join("\n"));
  assert.ok(result.checks.some((check) => check.message.includes("Electron package installed")));
  assert.ok(result.checks.some((check) => check.message.includes("Desktop data directory is outside repo data")));
});
