export function collectDesktopSetupPayload(root = document) {
  return {
    mode: field(root, "desktopSetupMode") || "demo",
    workspaceName: field(root, "desktopWorkspaceName") || "我的账号工具箱",
    defaultLanguage: field(root, "desktopDefaultLanguage") || "en",
    defaultCountry: field(root, "desktopDefaultCountry") || "",
    defaultDailyPostLimit: Number(field(root, "desktopDailyPostLimit") || 10),
    defaultLane: field(root, "desktopDefaultLane") || "ai_startups",
    accountsText: field(root, "desktopSetupAccounts") || "",
    csv: field(root, "desktopSetupCsv") || "",
    backupText: field(root, "desktopSetupBackup") || ""
  };
}

export function collectDesktopImportPayload(root = document, workspaceId = "workspace_default") {
  return {
    workspaceId,
    text: field(root, "desktopAccountImportText"),
    csv: field(root, "desktopAccountImportCsv"),
    defaultLane: field(root, "desktopImportLane") || "ai_startups",
    defaultLanguage: field(root, "desktopImportLanguage") || "en",
    defaultCountry: field(root, "desktopImportCountry") || "",
    defaultDailyPostLimit: Number(field(root, "desktopImportDailyLimit") || 10)
  };
}

export function collectDesktopNetworkNotesPayload(root = document, workspaceId = "workspace_default") {
  return {
    workspaceId,
    csv: field(root, "desktopNetworkNotesImportCsv") || field(root, "desktopNetworkNotesImportText")
  };
}

export function collectDesktopTaskPayload(root = document, accountId = "", workspaceId = "workspace_default") {
  return {
    workspaceId,
    accountId,
    copyText: field(root, "desktopTaskCopy"),
    contentType: field(root, "desktopTaskContentType") || "post",
    hasLink: field(root, "desktopTaskHasLink") === "yes",
    recommendedAt: field(root, "desktopTaskRecommendedAt"),
    notes: field(root, "desktopTaskNotes")
  };
}

export function collectDesktopFeedbackPayload(root = document, taskId = "") {
  const metrics = {};
  for (const key of ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"]) {
    metrics[key] = Number(root.querySelector(`[data-feedback-metric="${key}"][data-task-id="${cssEscape(taskId)}"]`)?.value || 0);
  }
  return {
    taskId,
    metrics,
    notes: root.querySelector(`[data-feedback-notes][data-task-id="${cssEscape(taskId)}"]`)?.value || ""
  };
}

function field(root, name) {
  return root.querySelector(`[name="${name}"]`)?.value?.trim() || "";
}

function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, "\\\"");
}
