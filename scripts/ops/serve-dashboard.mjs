import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "../lib/env.mjs";
import { loadManagerSummary } from "../lib/manager-system.mjs";
import { getAppStorage } from "../lib/app-storage.mjs";
import { handleAppApiGet, handleAppApiPost } from "../lib/app-api/session.mjs";
import { appFailure } from "../lib/app-api/response.mjs";
import { handleDashboardApiGet } from "../lib/dashboard/api-get-routes.mjs";
import { handleDashboardApiPost } from "../lib/dashboard/api-post-routes.mjs";
import { handleDesktopApiGet } from "../lib/desktop/api-get-routes.mjs";
import { handleDesktopApiPost } from "../lib/desktop/api-post-routes.mjs";
import { finishDesktopXOAuthCallback } from "../lib/storage/interface.mjs";

await loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const dashboardDir = path.join(rootDir, "dashboard");
const staffDir = path.join(rootDir, "staff");
const managerDir = path.join(rootDir, "manager");
const publicDir = path.join(rootDir, "public");
const allowedRoots = [
  dashboardDir,
  staffDir,
  managerDir,
  publicDir,
  path.join(rootDir, "data"),
  path.join(rootDir, "output")
];

let desktopRuntimeHandlers = {};

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"]
]);

function parseArgs(argv) {
  const args = { port: 4173, host: "127.0.0.1" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--port") args.port = Number(argv[++index]);
    if (argv[index] === "--host") args.host = argv[++index];
  }
  return args;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

async function parseBody(request) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) throw new Error("POST only accepts application/json");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

async function handleApi(request, response, url) {
  try {
    if (url.pathname.startsWith("/api/app/v1/")) {
      const appOptions = { storage: getAppStorage(), loadManagerSummary };
      if (request.method === "GET") {
        const result = await handleAppApiGet({ request, url, options: appOptions });
        if (result.response) {
          await sendWebResponse(response, result.response);
          return;
        }
        sendJson(response, result.status, result.payload);
        return;
      }
      if (request.method === "POST") {
        const body = await parseBody(request);
        const result = await handleAppApiPost({ request, url, body, options: appOptions });
        sendJson(response, result.status, result.payload);
        return;
      }
      sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
      return;
    }

    if (request.method === "GET") {
      if (url.pathname === "/api/oauth/x/callback") {
        try {
          const data = await finishDesktopXOAuthCallback({
            code: url.searchParams.get("code") || "",
            state: url.searchParams.get("state") || "",
            error: url.searchParams.get("error") || ""
          });
          sendHtml(response, 200, oauthCallbackHtml(data));
        } catch (error) {
          sendHtml(response, 400, oauthCallbackHtml({ message: error.message || "X OAuth 回调失败。" }));
        }
        return;
      }
      const desktopResult = await handleDesktopApiGet(url);
      if (desktopResult?.handled) {
        sendJson(
          response,
          desktopResult.status,
          desktopResult.wrap ? { ok: true, data: desktopResult.data } : desktopResult.data
        );
        return;
      }
      const data = await handleDashboardApiGet(url);
      sendJson(response, 200, { ok: true, data });
      return;
    }

    if (request.method === "POST") {
      const body = await parseBody(request);
      const data = await handleApiPost(url.pathname, body);
      sendJson(response, 200, { ok: true, data });
      return;
    }

    sendJson(response, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    if (url.pathname.startsWith("/api/app/v1/")) {
      const result = appFailure(error);
      sendJson(response, result.status, result.payload);
      return;
    }
    sendJson(response, 400, { ok: false, error: error.message });
  }
}

async function sendWebResponse(response, webResponse) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

function handleApiPost(pathname, body) {
  if (pathname.startsWith("/api/desktop/")) return handleDesktopApiPost(pathname, body, { desktopRuntimeHandlers });
  return handleDashboardApiPost(pathname, body);
}

function oauthCallbackHtml(data) {
  const message = escapeHtml(data.message || "X OAuth callback received.");
  return `<!doctype html>
<meta charset="utf-8">
<title>AI Creator OS Desktop · X OAuth</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f4; color: #17201b; }
  main { width: min(560px, calc(100vw - 40px)); padding: 28px; border: 1px solid #dfe5dc; border-radius: 16px; background: #fff; box-shadow: 0 18px 40px rgba(22, 34, 28, 0.08); }
  h1 { margin: 0 0 10px; font-size: 22px; }
  p { margin: 0 0 12px; color: #647067; line-height: 1.55; }
  code { padding: 2px 6px; border-radius: 6px; background: #f0f3ef; }
</style>
<main>
  <h1>X OAuth 回调已收到</h1>
  <p>${message}</p>
  <p>现在可以关闭这个窗口，回到 AI Creator OS 桌面版。</p>
  <p><code>不会创建假正式账号，也不会把 token 返回给前端。</code></p>
</main>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function resolveStaticPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  if (cleanPath === "/" || cleanPath === "/dashboard" || cleanPath === "/dashboard/") {
    return path.join(dashboardDir, "index.html");
  }
  if (cleanPath === "/staff" || cleanPath === "/staff/") {
    return path.join(staffDir, "index.html");
  }
  if (cleanPath === "/manager" || cleanPath === "/manager/") {
    return path.join(managerDir, "index.html");
  }
  if (cleanPath === "/index.html") return path.join(dashboardDir, "index.html");

  const requestPath = cleanPath.replace(/^\/+/, "");
  const candidate = path.normalize(path.join(rootDir, requestPath));
  const isAllowed = allowedRoots.some((allowedRoot) => {
    const relative = path.relative(allowedRoot, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  return isAllowed ? candidate : null;
}

async function serveStatic(request, response) {
  const filePath = resolveStaticPath(request.url ?? "/");
  if (!filePath) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const ext = path.extname(filePath);
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes.get(ext) ?? "application/octet-stream",
      "cache-control": "no-store, no-cache, must-revalidate"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found. Run npm run daily if data/latest.json is missing.");
  }
}

export function startDashboardServer(args = parseArgs(process.argv.slice(2))) {
  desktopRuntimeHandlers = args.desktopHandlers || {};
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }
    serveStatic(request, response);
  });

  server.listen(args.port, args.host, () => {
    if (!args.silent) console.log(`Dashboard running at http://${args.host}:${args.port}/dashboard/`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startDashboardServer();
}
