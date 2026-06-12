import { createHash } from "node:crypto";

export function slugify(text) {
  const slug = String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "item";
}

export function normalizeDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function createToolId(name, url) {
  const domain = normalizeDomain(url) || "unknown-domain";
  const slug = slugify(name);
  const hash = createHash("sha1").update(`${domain}::${slug}`).digest("hex").slice(0, 10);
  return `tool_${domain.replace(/[^a-z0-9]+/g, "_")}_${slug}_${hash}`;
}

export function createStableId(prefix, parts) {
  const raw = parts.map((part) => String(part ?? "")).join("::");
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

export function todayString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
