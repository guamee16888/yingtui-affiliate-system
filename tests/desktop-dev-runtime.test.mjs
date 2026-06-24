import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test from "node:test";
import { canListen, DEFAULT_DESKTOP_PORT, findDesktopPort, getDesktopAppDataDir } from "../desktop/app-config.mjs";
import { buildDesktopManagerUrl, resolveDesktopLoadUrl } from "../desktop/runtime-url.mjs";
import { assertDesktopWorktree, resolveElectronBin } from "../scripts/desktop/desktop-dev.mjs";

test("desktop dev URL carries desktop app mode and local dev email", () => {
  const url = new URL(buildDesktopManagerUrl({ port: 5288 }));
  assert.equal(url.origin, "http://127.0.0.1:5288");
  assert.equal(url.pathname, "/manager/");
  assert.equal(url.searchParams.get("desktop"), "1");
  assert.equal(url.searchParams.get("appMode"), "1");
  assert.equal(url.searchParams.get("devEmail"), "owner@guamee.local");
});

test("desktop port selection uses 5288 when available", async (t) => {
  if (!(await canListen(DEFAULT_DESKTOP_PORT))) {
    t.skip("5288 is already in use on this machine.");
    return;
  }
  const port = await findDesktopPort({ startPort: DEFAULT_DESKTOP_PORT, maxPort: DEFAULT_DESKTOP_PORT });
  assert.equal(port, DEFAULT_DESKTOP_PORT);
});

test("desktop port selection switches to 5289 when 5288 is occupied", async (t) => {
  if (!(await canListen(5288)) || !(await canListen(5289))) {
    t.skip("5288 or 5289 is already in use on this machine.");
    return;
  }
  const blocker = createServer();
  await listen(blocker, 5288);
  try {
    const busyPorts = [];
    const port = await findDesktopPort({
      startPort: 5288,
      maxPort: 5290,
      onPortBusy: (busyPort) => busyPorts.push(busyPort)
    });
    assert.equal(port, 5289);
    assert.deepEqual(busyPorts, [5288]);
  } finally {
    await close(blocker);
  }
});

test("desktop runtime checks worktree files and local Electron install", async () => {
  await assert.equal(await assertDesktopWorktree(process.cwd()), true);
  const electronBin = await resolveElectronBin(process.cwd());
  assert.match(electronBin, /node_modules\/\.bin\/electron/);
});

test("desktop preload path exists and Electron load URL can come from env", async () => {
  const preload = await readFile("desktop/preload.mjs", "utf8");
  assert.match(preload, /contextBridge/);
  assert.equal(
    resolveDesktopLoadUrl({ AI_CREATOR_OS_DESKTOP_URL: "http://127.0.0.1:5299/manager/?desktop=1" }),
    "http://127.0.0.1:5299/manager/?desktop=1"
  );
});

test("desktop data directory is outside repo data", () => {
  const dir = getDesktopAppDataDir("darwin", { HOME: "/Users/example" });
  assert.equal(dir.includes("/Documents/ai-creator-os-desktop/data"), false);
  assert.match(dir, /Library\/Application Support\/AI Creator OS$/);
});

function listen(server, port) {
  return new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
