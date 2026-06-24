import { fileURLToPath } from "node:url";

export async function checkDesktopHealth({
  baseUrl = "http://127.0.0.1:5288",
  timeoutMs = 10_000,
  intervalMs = 250,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available in this Node runtime.");
  const healthUrl = new URL("/api/desktop/health", baseUrl).toString();
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    try {
      const response = await fetchImpl(healthUrl, { headers: { accept: "application/json" } });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.ok === true) return { ok: true, url: healthUrl, payload };
        lastError = new Error(`Health payload was not ok: ${JSON.stringify(payload)}`);
      } else {
        lastError = new Error(`Health returned HTTP ${response.status}`);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  const message = lastError?.message || "desktop health did not become ready";
  throw new Error(`Desktop health check timed out after ${timeoutMs}ms: ${message}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = process.argv[2] || "http://127.0.0.1:5288";
  try {
    const result = await checkDesktopHealth({ baseUrl });
    console.log("Desktop health check passed.");
    console.log(JSON.stringify(result.payload, null, 2));
  } catch (error) {
    console.error(`Desktop health check failed: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
