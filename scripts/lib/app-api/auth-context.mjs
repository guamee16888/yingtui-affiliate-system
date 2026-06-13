import { getCloudflareAccessPayload, isStrictAppEnv } from "./cloudflare-access-auth.mjs";
import { AppApiError } from "./response.mjs";

const ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";
const DEV_FALLBACK_EMAIL = "owner@guamee.local";
const DEV_FALLBACK_USER_ID = "user_owner";

export async function getAuthContext(request, options = {}) {
  const env = options.env || process.env;
  const url = options.url || new URL(request?.url || "/", "http://localhost");
  const emailFromAccess = headerValue(request, ACCESS_EMAIL_HEADER);
  const devEmail = String(url.searchParams.get("devEmail") || env.APP_DEV_EMAIL || "").trim();
  const strictAppEnv = isStrictAppEnv(env);

  if (devEmail && strictAppEnv) {
    throw new AppApiError("DEV_EMAIL_DISABLED", "staging/production 环境不能使用 devEmail。", 403);
  }

  let email = "";
  if (strictAppEnv) {
    const payload = await getCloudflareAccessPayload(request, options);
    email = normalizeEmail(payload.email);
  } else {
    email = normalizeEmail(emailFromAccess || options.accessJwtPayload?.email || devEmail);
  }
  if (!email) throw new AppApiError("UNAUTHENTICATED", "请先登录。", 401);

  const collections = options.collections || await loadAuthCollections(options.storage);
  const user = resolveUser(email, collections.users);
  if (!user) throw new AppApiError("USER_NOT_FOUND", "当前用户没有绑定账号。", 403);

  const requestedWorkspaceId = String(url.searchParams.get("workspaceId") || options.workspaceId || user.workspaceId || "").trim();
  const workspaceIds = resolveWorkspaceIds(user, collections);
  const workspaceId = resolveWorkspaceId({ requestedWorkspaceId, workspaceIds, role: user.role, workspaces: collections.workspaces });
  if (!workspaceId) throw new AppApiError("WORKSPACE_NOT_BOUND", "当前用户没有绑定 workspace。", 403);

  const workspace = collections.workspaces.find((item) => item.workspaceId === workspaceId) ?? null;
  const role = roleForWorkspace(user, workspace);

  return {
    email,
    userId: user.userId,
    role,
    workspaceId,
    workspaceIds,
    workspaceName: workspace?.name || workspaceId,
    isDev: Boolean(devEmail && !emailFromAccess && !strictAppEnv),
    user,
    workspace
  };
}

export async function loadAuthCollections(storage) {
  if (storage && typeof storage.loadAuthCollections === "function") {
    return storage.loadAuthCollections();
  }
  throw new AppApiError("APP_AUTH_STORAGE_MISSING", "App API auth storage is not configured.", 500);
}

export function resolveUser(email, users = []) {
  const normalized = normalizeEmail(email);
  return users.find((user) => normalizeEmail(user.email) === normalized)
    ?? users.find((user) => normalizeEmail(user.name) === normalized)
    ?? (normalized === DEV_FALLBACK_EMAIL ? users.find((user) => user.userId === DEV_FALLBACK_USER_ID) : null)
    ?? null;
}

function resolveWorkspaceIds(user, collections) {
  const ids = new Set();
  if (user.workspaceId) ids.add(user.workspaceId);
  for (const workspace of collections.workspaces) {
    if ((workspace.managerUserIds ?? []).includes(user.userId)) ids.add(workspace.workspaceId);
    if ((workspace.staffUserIds ?? []).includes(user.userId)) ids.add(workspace.workspaceId);
  }
  for (const assignment of collections.assignments) {
    if (assignment.userId !== user.userId) continue;
    if (assignment.workspaceId) ids.add(assignment.workspaceId);
    const account = collections.xAccounts.find((item) => item.accountId === assignment.accountId);
    if (account?.workspaceId) ids.add(account.workspaceId);
  }
  return [...ids];
}

function resolveWorkspaceId({ requestedWorkspaceId, workspaceIds, role, workspaces }) {
  if (requestedWorkspaceId) {
    if (role === "admin" || workspaceIds.includes(requestedWorkspaceId)) return requestedWorkspaceId;
    return "";
  }
  return workspaceIds[0] || (role === "admin" ? workspaces[0]?.workspaceId : "") || "";
}

function roleForWorkspace(user, workspace) {
  if (user.role === "admin") return "admin";
  if ((workspace?.managerUserIds ?? []).includes(user.userId)) return "manager";
  if ((workspace?.staffUserIds ?? []).includes(user.userId)) return "staff";
  return user.role || "staff";
}

function headerValue(request, headerName) {
  if (!request?.headers) return "";
  if (typeof request.headers.get === "function") return request.headers.get(headerName) || "";
  return request.headers[headerName] || request.headers[headerName.toLowerCase()] || "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
