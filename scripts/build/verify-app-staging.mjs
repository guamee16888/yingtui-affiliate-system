import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://app.guamee.org";

export function parseVerifyAppStagingArgs(argv = []) {
  const parsed = { url: DEFAULT_URL, expectProtected: false, expectOpen: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") parsed.url = argv[++index] || DEFAULT_URL;
    else if (arg.startsWith("--url=")) parsed.url = arg.slice("--url=".length) || DEFAULT_URL;
    else if (arg === "--expect-protected") parsed.expectProtected = true;
    else if (arg === "--expect-open") parsed.expectOpen = true;
  }
  return parsed;
}

export function classifyAppStagingResponse({ status = 0, body = "", location = "", expectOpen = false } = {}) {
  const text = String(body || "");
  const redirectTarget = String(location || "");
  const accessSignal = /cloudflare access|cloudflare zero trust|cdn-cgi\/access|cloudflareaccess\.com|access login/i.test(`${text}\n${redirectTarget}`);
  const protectedStatus = [301, 302, 303, 307, 308, 401, 403].includes(Number(status));
  const appVisible = Number(status) === 200 && /AI Creator OS App|真实工作区|Workspace App Mode|多账号内容运营工作台/i.test(text);
  const notConfigured = [404, 530].includes(Number(status)) || /not found|not configured|error 1000|dns/i.test(text);

  if (expectOpen && appVisible) {
    return {
      ok: true,
      level: "pass",
      code: "EXPECTED_OPEN",
      message: "app staging is reachable and open as expected."
    };
  }

  if (protectedStatus || accessSignal) {
    return {
      ok: true,
      level: "pass",
      code: "ACCESS_PROTECTED",
      message: "app.guamee.org appears protected by Cloudflare Access."
    };
  }

  if (appVisible) {
    return {
      ok: false,
      level: "error",
      code: "APP_STAGING_PUBLIC",
      message: "app.guamee.org appears publicly accessible. Cloudflare Access should protect staging."
    };
  }

  if (notConfigured) {
    return {
      ok: false,
      level: "warning",
      code: "APP_STAGING_NOT_CONFIGURED",
      message: "app.guamee.org not configured yet."
    };
  }

  return {
    ok: false,
    level: "warning",
    code: "UNKNOWN_RESPONSE",
    message: `app.guamee.org returned status ${status}; staging protection could not be confirmed.`
  };
}

export async function verifyAppStaging({ url = DEFAULT_URL, expectOpen = false, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "ai-creator-os-app-staging-verifier" }
    });
  } catch (error) {
    return {
      ok: false,
      level: "warning",
      code: "APP_STAGING_NOT_CONFIGURED",
      message: `app.guamee.org not configured yet. ${error.message}`
    };
  }

  const status = response.status;
  const location = response.headers?.get?.("location") || "";
  const body = await response.text().catch(() => "");
  return classifyAppStagingResponse({ status, body, location, expectOpen });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseVerifyAppStagingArgs(process.argv.slice(2));
  const result = await verifyAppStaging(args);
  const prefix = result.level === "pass" ? "PASS" : result.level === "warning" ? "WARNING" : "ERROR";
  const writer = result.ok ? console.log : console.error;
  writer(`${prefix}: ${result.message}`);
  if (!result.ok && args.expectProtected) process.exitCode = 1;
}
