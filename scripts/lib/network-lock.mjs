const IP_ENDPOINTS = [
  "https://api.ipify.org?format=json",
  "https://ifconfig.me/ip"
];

export function normalizeAssignedIp(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const ipv4 = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  return ipv4 ? ipv4[0] : "";
}

export function compareNetworkLock({ assignedIp = "", currentIp = "" } = {}) {
  const assigned = normalizeAssignedIp(assignedIp);
  const current = normalizeAssignedIp(currentIp);
  return {
    assignedIp: assigned,
    currentIp: current,
    configured: Boolean(assigned),
    checked: Boolean(current),
    matches: Boolean(assigned && current && assigned === current)
  };
}

export async function fetchCurrentPublicIp({ fetcher = fetch, timeoutMs = 5000 } = {}) {
  let lastError = null;
  for (const endpoint of IP_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(endpoint, {
        headers: { accept: "application/json, text/plain, */*" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`IP endpoint returned ${response.status}`);
      const text = await response.text();
      const ip = extractIp(text);
      if (ip) return { ip, source: endpoint };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`无法检测当前公网 IP：${lastError?.message || "network unavailable"}`);
}

function extractIp(text = "") {
  try {
    const json = JSON.parse(text);
    const ip = normalizeAssignedIp(json.ip || "");
    if (ip) return ip;
  } catch {
    // Plain text endpoint; fall through to regex extraction.
  }
  return normalizeAssignedIp(text);
}
