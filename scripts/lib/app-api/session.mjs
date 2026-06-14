import { getAuthContext } from "./auth-context.mjs";
import { peekDiscordStateWorkspaceId } from "./discord-auth.mjs";
import { handleDiscordGet, isDiscordAuthRoute } from "./discord-routes.mjs";
import { handleManagerGet, handleManagerPost } from "./manager-routes.mjs";
import { appSuccess, AppApiError } from "./response.mjs";
import { handleStaffGet, handleStaffPost } from "./staff-routes.mjs";
import { assertAuthenticated, assertWorkspaceAccess } from "./workspace-scope.mjs";

export async function handleAppApiGet({ request, url, options = {} }) {
  const storage = resolveStorage(options);
  const pathname = url.pathname;
  const discordWorkspaceId = pathname === "/api/app/v1/auth/discord/callback"
    ? peekDiscordStateWorkspaceId(url.searchParams.get("state"))
    : "";
  const context = await getAuthContext(request, {
    ...options,
    url,
    storage,
    workspaceId: discordWorkspaceId || options.workspaceId,
    skipEntitlement: isDiscordAuthRoute(pathname)
  });

  if (isDiscordAuthRoute(pathname)) {
    return handleDiscordGet({
      pathname,
      request,
      url,
      context,
      storage,
      env: options.env || {},
      fetchImpl: options.fetchImpl || fetch
    });
  }

  if (pathname === "/api/app/v1/session") return appSuccess(sessionView(context));
  if (pathname === "/api/app/v1/workspace") return appSuccess(await workspaceView({ context, storage }));

  const managerData = await handleManagerGet({
    pathname,
    url,
    context,
    storage,
    loadManagerSummaryFn: options.loadManagerSummary || storage.loadManagerSummary
  });
  if (managerData) return appSuccess(managerData);
  const staffData = await handleStaffGet({ pathname, url, context, storage });
  if (staffData) return appSuccess(staffData);

  throw new AppApiError("NOT_FOUND", "App API 路由不存在。", 404);
}

export async function handleAppApiPost({ request, url, body, options = {} }) {
  const storage = resolveStorage(options);
  const context = await getAuthContext(request, { ...options, url, storage });
  const pathname = url.pathname;

  const managerData = await handleManagerPost({ pathname, body, context, storage });
  if (managerData) return appSuccess(managerData);
  const staffData = await handleStaffPost({ pathname, body, context, storage });
  if (staffData) return appSuccess(staffData);

  throw new AppApiError("NOT_FOUND", "App API 路由不存在。", 404);
}

function resolveStorage(options) {
  const storage = options.storage || options.storageFactory?.(options);
  if (!storage) throw new AppApiError("APP_STORAGE_MISSING", "App API storage is not configured.", 500);
  return storage;
}

function sessionView(context) {
  return {
    email: context.email,
    userId: context.userId,
    role: context.role,
    workspaceId: context.workspaceId,
    workspaceIds: context.workspaceIds,
    workspaceName: context.workspaceName,
    isDev: context.isDev
  };
}

async function workspaceView({ context, storage }) {
  assertAuthenticated(context);
  const workspaceId = assertWorkspaceAccess(context, context.workspaceId);
  const workspace = await storage.getWorkspace(workspaceId);
  if (!workspace) throw new AppApiError("WORKSPACE_NOT_FOUND", "当前 workspace 不存在。", 404);
  return {
    workspaceId: workspace.workspaceId,
    name: workspace.name || workspace.workspaceId,
    plan: workspace.plan || "",
    accountLimit: Number(workspace.accountLimit ?? 30),
    enabledLaneIds: workspace.enabledLaneIds ?? [],
    publishMode: workspace.publishMode || "manual",
    autoPublishEnabled: Boolean(workspace.autoPublishEnabled),
    requiresFinalApproval: workspace.requiresFinalApproval !== false
  };
}
