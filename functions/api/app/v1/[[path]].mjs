import { getAppStorage } from "../../../../scripts/lib/app-storage.mjs";
import { AppApiError, appFailure } from "../../../../scripts/lib/app-api/response.mjs";
import { handleAppApiGet, handleAppApiPost } from "../../../../scripts/lib/app-api/session.mjs";

export async function onRequest(context) {
  return handlePagesAppRequest(context);
}

export async function handlePagesAppRequest(context, overrides = {}) {
  const request = context.request;
  const env = appEnv(context.env || {});
  const url = new URL(request.url);

  try {
    if (!overrides.storage && !context.env?.DB) {
      throw new AppApiError("D1_BINDING_MISSING", "D1 binding DB is not configured.", 500);
    }
    const storage = overrides.storage || getAppStorage({ env, d1Binding: context.env.DB });
    const options = {
      env,
      storage,
      fetchImpl: overrides.fetchImpl,
      accessJwtPayload: overrides.accessJwtPayload,
      loadManagerSummary: storage.loadManagerSummary ? storage.loadManagerSummary.bind(storage) : undefined
    };

    if (request.method === "GET") {
      const result = await handleAppApiGet({ request, url, options });
      return jsonResponse(result.status, result.payload);
    }

    if (request.method === "POST") {
      const body = await parseJsonBody(request);
      const result = await handleAppApiPost({ request, url, body, options });
      return jsonResponse(result.status, result.payload);
    }

    return jsonResponse(405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  } catch (error) {
    const result = appFailure(error);
    return jsonResponse(result.status, result.payload);
  }
}

function appEnv(env) {
  return {
    APP_ENV: env.APP_ENV || "staging",
    APP_STORAGE_MODE: env.APP_STORAGE_MODE || "d1",
    CF_ACCESS_TEAM_DOMAIN: env.CF_ACCESS_TEAM_DOMAIN || "",
    CF_ACCESS_AUD: env.CF_ACCESS_AUD || ""
  };
}

async function parseJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new AppApiError("INVALID_JSON", "POST only accepts application/json.", 400);
  }
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppApiError("INVALID_JSON", "JSON 格式无效。", 400);
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
