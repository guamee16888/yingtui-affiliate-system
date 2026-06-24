import { createServer } from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { loadLocalEnv, updateDotEnv } from "../lib/env.mjs";
import { accountEnvUpdates, sanitizeAccountId } from "../lib/x-publish.mjs";

await loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const accountId = args.account ? String(args.account).trim() : "";

const port = Number(process.env.X_AUTH_PORT || 8787);
const redirectUri = process.env.X_REDIRECT_URI || `http://127.0.0.1:${port}/callback`;
const scopes = process.env.X_SCOPES || "tweet.read users.read tweet.write offline.access";
const clientId = process.env.X_CLIENT_ID;
const clientSecret = process.env.X_CLIENT_SECRET;

if (!clientId) {
  console.error(`X_CLIENT_ID is missing.

1. In X Developer Console, open your app.
2. Go to User authentication settings.
3. Set permissions to Read and write.
4. Add this callback URL exactly:
   ${redirectUri}
5. Copy the OAuth 2.0 Client ID into .env:
   X_CLIENT_ID="..."

If X shows a Client Secret too, add:
   X_CLIENT_SECRET="..."
`);
  process.exit(1);
}

if (accountId && !sanitizeAccountId(accountId)) {
  console.error("Invalid --account value. Use an accountId from config/x-accounts.json, for example ai_tools_lab.");
  process.exit(1);
}

if (clientId.includes("PASTE_") || clientSecret?.includes("PASTE_")) {
  console.error("Replace the placeholder X_CLIENT_ID / X_CLIENT_SECRET values in .env first.");
  process.exit(1);
}

const state = base64url(crypto.randomBytes(24));
const codeVerifier = base64url(crypto.randomBytes(64));
const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
const authUrl = buildAuthUrl();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", redirectUri);
  if (url.pathname !== "/callback") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    if (url.searchParams.get("state") !== state) throw new Error("State mismatch. Please run npm run x:auth again.");
    if (url.searchParams.get("error")) {
      throw new Error(`${url.searchParams.get("error")}: ${url.searchParams.get("error_description") || "X authorization failed"}`);
    }
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Authorization code missing from callback.");

    const token = await exchangeCodeForToken(code);
    const updates = {
      X_ACCESS_TOKEN: token.access_token,
      X_TOKEN_TYPE: token.token_type || "bearer"
    };
    if (token.refresh_token) updates.X_REFRESH_TOKEN = token.refresh_token;
    if (token.expires_in) {
      updates.X_ACCESS_TOKEN_EXPIRES_AT = new Date(Date.now() + Number(token.expires_in) * 1000).toISOString();
    }
    await updateDotEnv(accountId ? accountEnvUpdates(accountId, updates) : updates);

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(successHtml(updates.X_ACCESS_TOKEN_EXPIRES_AT, accountId));
    console.log(accountId ? `X access token for ${accountId} saved to .env.` : "X access token saved to .env.");
    if (updates.X_ACCESS_TOKEN_EXPIRES_AT) console.log(`Access token expires at ${updates.X_ACCESS_TOKEN_EXPIRES_AT}.`);
    console.log("Restart npm run dashboard so it reads the new token.");
    setTimeout(() => server.close(), 300);
  } catch (error) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message);
    console.error(error.message);
    setTimeout(() => server.close(), 300);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local callback listening on ${redirectUri}`);
  if (accountId) console.log(`Binding X OAuth token to accountId: ${accountId}`);
  console.log("Opening X authorization page...");
  console.log(authUrl);
  openUrl(authUrl);
});

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--account") parsed.account = argv[++index];
  }
  return parsed;
}

function buildAuthUrl() {
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeCodeForToken(code) {
  const attempts = clientSecret
    ? [
      { mode: "confidential", useSecret: true },
      { mode: "public_pkce", useSecret: false }
    ]
    : [{ mode: "public_pkce", useSecret: false }];

  const errors = [];
  for (const attempt of attempts) {
    try {
      return await exchangeCodeAttempt(code, attempt);
    } catch (error) {
      errors.push(`${attempt.mode}: ${error.message}`);
    }
  }
  throw new Error(`Token exchange failed. ${errors.join(" | ")}`);
}

async function exchangeCodeAttempt(code, attempt) {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (attempt.useSecret) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", clientId);
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = json.error_description || json.detail || json.error || response.statusText;
    throw new Error(`Token exchange failed (${response.status}): ${detail}`);
  }
  if (!json.access_token) throw new Error("Token exchange succeeded but no access_token was returned.");
  return json;
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function openUrl(url) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(opener, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function successHtml(expiresAt, accountId = "") {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>X 授权完成</title></head>
  <body style="font-family: system-ui; max-width: 720px; margin: 48px auto; line-height: 1.6;">
    <h1>X 授权完成</h1>
    <p>Access token 已保存到本地 <code>.env</code>${accountId ? `，并绑定到 <code>${accountId}</code>` : ""}。</p>
    ${expiresAt ? `<p>过期时间：<code>${expiresAt}</code></p>` : ""}
    <p>现在回到终端，重启 <code>npm run dashboard</code>。</p>
  </body>
</html>`;
}
