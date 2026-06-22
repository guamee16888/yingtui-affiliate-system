import assert from "node:assert/strict";
import test from "node:test";
import { compareNetworkLock, fetchCurrentPublicIp, normalizeAssignedIp } from "../scripts/lib/network-lock.mjs";

test("normalizeAssignedIp extracts IPv4 from assigned IP notes", () => {
  assert.equal(normalizeAssignedIp("38.154.203.95:5863"), "38.154.203.95");
  assert.equal(normalizeAssignedIp("出口 IP 198.105.121.200 / London"), "198.105.121.200");
  assert.equal(normalizeAssignedIp(""), "");
  assert.equal(normalizeAssignedIp("Japan residential"), "");
});

test("compareNetworkLock reports configured match and mismatch", () => {
  assert.deepEqual(compareNetworkLock({ assignedIp: "38.154.203.95:5863", currentIp: "38.154.203.95" }), {
    assignedIp: "38.154.203.95",
    currentIp: "38.154.203.95",
    configured: true,
    checked: true,
    matches: true
  });
  assert.deepEqual(compareNetworkLock({ assignedIp: "38.154.203.95", currentIp: "198.105.121.200" }), {
    assignedIp: "38.154.203.95",
    currentIp: "198.105.121.200",
    configured: true,
    checked: true,
    matches: false
  });
  assert.equal(compareNetworkLock({ assignedIp: "", currentIp: "38.154.203.95" }).configured, false);
});

test("fetchCurrentPublicIp parses JSON IP endpoint responses", async () => {
  const result = await fetchCurrentPublicIp({
    fetcher: async () => ({
      ok: true,
      text: async () => JSON.stringify({ ip: "1.2.3.4" })
    })
  });
  assert.equal(result.ip, "1.2.3.4");
  assert.match(result.source, /api\.ipify\.org|ifconfig\.me/);
});

test("fetchCurrentPublicIp parses plain text endpoint responses", async () => {
  const result = await fetchCurrentPublicIp({
    fetcher: async () => ({
      ok: true,
      text: async () => "5.6.7.8\n"
    })
  });
  assert.equal(result.ip, "5.6.7.8");
});

test("fetchCurrentPublicIp tries fallback endpoints before failing", async () => {
  let calls = 0;
  await assert.rejects(
    fetchCurrentPublicIp({
      fetcher: async () => {
        calls += 1;
        return {
          ok: false,
          status: 503,
          text: async () => ""
        };
      },
      timeoutMs: 50
    }),
    /无法检测当前公网 IP/
  );
  assert.equal(calls, 2);
});
