import { loadDesktopSetupStatus, completeDesktopSetup } from "../scripts/lib/desktop-data-store.mjs";

export async function shouldShowFirstRunWizard() {
  const status = await loadDesktopSetupStatus();
  return !status.setupCompleted;
}

export async function completeFirstRun(input = {}) {
  return completeDesktopSetup(input, { userId: "user_owner" });
}
