export function normalizeDomain(url) {
  try {
    const parsed = new URL(String(url ?? "").trim());
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeUrl(url) {
  const text = String(url ?? "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || ["ref", "fbclid", "gclid"].includes(lower)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const normalized = parsed.toString().replace(/\/$/, "");
    return normalized;
  } catch {
    return text
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
  }
}

export function isProductHuntUrl(url) {
  return normalizeDomain(url) === "producthunt.com";
}

export function extractDomainFromText(text) {
  const match = String(text ?? "").match(/https?:\/\/[^\s)]+/i);
  return match ? normalizeDomain(match[0]) : "";
}
