import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { checkDesktopHealth } from "../scripts/desktop-health-check.mjs";
import { startDashboardServer } from "../scripts/serve-dashboard.mjs";
import { findDesktopPort } from "../desktop/app-config.mjs";

test("desktop health check succeeds only when backend reports ok true", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/api/desktop/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, mode: "desktop", port: 0 }));
      return;
    }
    response.writeHead(404).end();
  });
  const port = await listen(server);
  try {
    const result = await checkDesktopHealth({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 500 });
    assert.equal(result.ok, true);
    assert.equal(result.payload.mode, "desktop");
  } finally {
    await close(server);
  }
});

test("desktop health check times out when backend is not ready", async () => {
  await assert.rejects(
    () => checkDesktopHealth({
      baseUrl: "http://127.0.0.1:9",
      timeoutMs: 60,
      intervalMs: 10,
      fetchImpl: async () => {
        throw new Error("connection refused");
      }
    }),
    /timed out/
  );
});

test("serve-dashboard exposes direct desktop health payload without secrets", async () => {
  const previous = {
    APP_STORAGE_MODE: process.env.APP_STORAGE_MODE,
    AI_CREATOR_OS_DESKTOP: process.env.AI_CREATOR_OS_DESKTOP,
    AI_CREATOR_OS_DESKTOP_PORT: process.env.AI_CREATOR_OS_DESKTOP_PORT,
    AI_CREATOR_OS_DATA_DIR: process.env.AI_CREATOR_OS_DATA_DIR
  };
  const port = await findDesktopPort({ startPort: 5310, maxPort: 5399 });
  process.env.APP_STORAGE_MODE = "json";
  process.env.AI_CREATOR_OS_DESKTOP = "1";
  process.env.AI_CREATOR_OS_DESKTOP_PORT = String(port);
  process.env.AI_CREATOR_OS_DATA_DIR = "/tmp/ai-creator-os-test";
  const server = startDashboardServer({ host: "127.0.0.1", port, silent: true });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/desktop/health`);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "desktop");
    assert.equal(payload.port, port);
    assert.equal(payload.storageMode, "json");
    assert.doesNotMatch(JSON.stringify(payload), /token|secret|api[_-]?key/i);
  } finally {
    await close(server);
    restoreEnv(previous);
  }
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
