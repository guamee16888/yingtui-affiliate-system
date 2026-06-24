import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://admin.guamee.org";

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

export function classifyAdminAccessResponse({ status = 0, body = "", location = "", expectOpen = false } = {}) {
  const text = String(body || "");
  const redirectTarget = String(location || "");
  const accessLoginSignal = /cloudflare access|cloudflare zero trust|cdn-cgi\/access|cloudflareaccess\.com|access login/i.test(`${text}\n${redirectTarget}`);
  const protectedStatus = [301, 302, 303, 307, 308, 401, 403].includes(Number(status));
  const adminDemoVisible = Number(status) === 200 && text.includes("AI Creator OS") && text.includes("受保护总后台演示");

  if (expectOpen && Number(status) === 200) {
    return {
      ok: true,
      level: "pass",
      code: "EXPECTED_OPEN",
      message: "Admin domain is reachable and open as expected."
    };
  }

  if (adminDemoVisible) {
    return {
      ok: false,
      level: "error",
      code: "ADMIN_PUBLIC",
      message: "Admin demo appears publicly accessible. Cloudflare Access may not be protecting this domain."
    };
  }

  if (protectedStatus || accessLoginSignal) {
    return {
      ok: true,
      level: "pass",
      code: "ACCESS_PROTECTED",
      message: "Admin domain appears protected by Access."
    };
  }

  return {
    ok: false,
    level: "warning",
    code: "UNKNOWN_RESPONSE",
    message: `Admin domain returned status ${status}; protection could not be confirmed.`
  };
}

export async function verifyAdminAccess({ url = DEFAULT_URL, expectOpen = false, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "ai-creator-os-admin-access-verifier" }
    });
  } catch (error) {
    return {
      ok: false,
      level: "warning",
      code: "DOMAIN_UNREACHABLE",
      message: `Domain not reachable yet. Check DNS / Pages custom domain status. ${error.message}`
    };
  }

  const status = response.status;
  const location = response.headers?.get?.("location") || "";
  const body = await response.text().catch(() => "");
  return classifyAdminAccessResponse({ status, body, location, expectOpen });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseVerifyArgs(process.argv.slice(2));
  const result = await verifyAdminAccess(args);
  const prefix = result.level === "pass" ? "PASS" : result.level === "warning" ? "WARNING" : "ERROR";
  const writer = result.ok ? console.log : console.error;
  writer(`${prefix}: ${result.message}`);
  if (!result.ok) process.exitCode = 1;
}
