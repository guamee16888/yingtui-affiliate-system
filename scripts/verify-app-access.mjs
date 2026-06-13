import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://app.guamee.org";

export function parseVerifyArgs(argv = []) {
  const parsed = { url: DEFAULT_URL, expectOpen: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") parsed.url = argv[++index] || DEFAULT_URL;
    else if (arg.startsWith("--url=")) parsed.url = arg.slice("--url=".length) || DEFAULT_URL;
    else if (arg === "--expect-open") parsed.expectOpen = true;
  }
  return parsed;
}

export function classifyAppAccessResponse({ status = 0, body = "", location = "", expectOpen = false } = {}) {
  const text = String(body || "");
  const redirectTarget = String(location || "");
  const accessLoginSignal = /cloudflare access|cloudflare zero trust|cdn-cgi\/access|cloudflareaccess\.com|access login/i.test(`${text}\n${redirectTarget}`);
  const protectedStatus = [301, 302, 303, 307, 308, 401, 403].includes(Number(status));
  const appPlaceholderVisible = Number(status) === 200 && text.includes("AI Creator OS App") && text.includes("受保护应用预览");

  if (expectOpen && appPlaceholderVisible) {
    return {
      ok: true,
      level: "pass",
      code: "EXPECTED_OPEN",
      message: "app.guamee.org placeholder is reachable and open as expected."
    };
  }

  if (appPlaceholderVisible) {
    return {
      ok: false,
      level: "error",
      code: "APP_PUBLIC",
      message: "app.guamee.org appears publicly accessible. Cloudflare Access may not be protecting this domain."
    };
  }

  if (protectedStatus || accessLoginSignal) {
    return {
      ok: true,
      level: "pass",
      code: "ACCESS_PROTECTED",
      message: "app.guamee.org appears protected by Access."
    };
  }

  return {
    ok: false,
    level: "warning",
    code: "UNKNOWN_RESPONSE",
    message: `app.guamee.org returned status ${status}; protection could not be confirmed.`
  };
}

export async function verifyAppAccess({ url = DEFAULT_URL, expectOpen = false, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "ai-creator-os-app-access-verifier" }
    });
  } catch (error) {
    return {
      ok: false,
      level: "warning",
      code: "DOMAIN_UNREACHABLE",
      message: `app.guamee.org is not reachable yet. Configure Pages custom domain and Access. ${error.message}`
    };
  }

  const status = response.status;
  const location = response.headers?.get?.("location") || "";
  const body = await response.text().catch(() => "");
  return classifyAppAccessResponse({ status, body, location, expectOpen });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseVerifyArgs(process.argv.slice(2));
  const result = await verifyAppAccess(args);
  const prefix = result.level === "pass" ? "PASS" : result.level === "warning" ? "WARNING" : "ERROR";
  const writer = result.ok ? console.log : console.error;
  writer(`${prefix}: ${result.message}`);
  if (!result.ok) process.exitCode = 1;
}
