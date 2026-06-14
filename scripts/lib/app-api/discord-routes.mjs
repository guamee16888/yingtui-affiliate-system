import { createDiscordAuthorizationUrl, verifyDiscordCallback } from "./discord-auth.mjs";
import { AppApiError, appSuccess } from "./response.mjs";

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

  if (pathname === "/api/app/v1/auth/discord/callback") {
    const result = await verifyDiscordCallback({ env, url, context, storage, fetchImpl });
    return {
      response: Response.redirect(`${url.origin}/manager/?appMode=1&discord=verified`, 302),
      data: result
    };
  }

  throw new AppApiError("NOT_FOUND", "Discord auth route 不存在。", 404);
}

export function isDiscordAuthRoute(pathname) {
  return pathname.startsWith("/api/app/v1/auth/discord/");
}
