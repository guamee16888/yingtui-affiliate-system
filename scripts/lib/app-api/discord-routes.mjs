import { createDiscordAuthorizationUrl, verifyDiscordCallback } from "./discord-auth.mjs";
import { AppApiError, appSuccess } from "./response.mjs";

const DISCORD_CALLBACK_PATHS = new Set([
  "/api/app/v1/auth/discord/callback",
  "/api/app/v1/link/return",
  "/api/app/v1/link/finish"
]);

export async function handleDiscordGet({ pathname, request, url, context, storage, env, fetchImpl }) {
  if (pathname === "/api/app/v1/auth/discord/status") {
    return appSuccess({
      required: Boolean(context.discord?.required),
      verified: Boolean(context.discord?.verified),
      providerUserId: context.discord?.providerUserId || "",
      username: context.discord?.username || "",
      guildId: context.discord?.guildId || "",
      requiredGuildId: context.discord?.requiredGuildId || "",
      requiredRoleIds: context.discord?.requiredRoleIds || [],
      reason: context.discord?.reason || ""
    });
  }

  if (pathname === "/api/app/v1/auth/discord/start") {
    const authorizationUrl = await createDiscordAuthorizationUrl({ env, url, context, request });
    return appSuccess({ authorizationUrl });
  }

  if (isDiscordCallbackRoute(pathname)) {
    const result = await verifyDiscordCallback({ env, url, context, storage, fetchImpl });
    if (pathname === "/api/app/v1/link/finish") {
      return appSuccess({
        verified: true,
        username: result.identity?.username || "",
        guildId: result.identity?.guildId || ""
      });
    }
    return {
      response: Response.redirect(`${url.origin}/manager/?appMode=1&discord=verified`, 302),
      data: result
    };
  }

  throw new AppApiError("NOT_FOUND", "Discord auth route 不存在。", 404);
}

export function isDiscordCallbackRoute(pathname) {
  return DISCORD_CALLBACK_PATHS.has(pathname);
}

export function isDiscordAuthRoute(pathname) {
  return pathname.startsWith("/api/app/v1/auth/discord/") || isDiscordCallbackRoute(pathname);
}
