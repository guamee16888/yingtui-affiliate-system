import { createHash } from "node:crypto";
import { hashText, normalizeText } from "./text-normalizer.mjs";
import { normalizeDomain } from "./url-utils.mjs";

export { normalizeDomain };

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

export function createToolId(name, url) {
  const domain = normalizeDomain(url) || "unknown-domain";
  const slug = slugify(name);
  const hash = createHash("sha1").update(`${domain}::${slug}`).digest("hex").slice(0, 10);
  return `tool_${domain.replace(/[^a-z0-9]+/g, "_")}_${slug}_${hash}`;
}

export function createUserId(name) {
  return createStableId("user", [slugify(name)]);
}

export function createAccountId(handle) {
  const clean = String(handle ?? "").replace(/^@/, "").trim().toLowerCase();
  return createStableId("xacc", [slugify(clean || "account")]);
}

export function createTopicId(toolId, angleType, audience, painPoint, useCase) {
  return createStableId("topic", [
    toolId,
    angleType,
    normalizeText(audience),
    normalizeText(painPoint),
    normalizeText(useCase)
  ]);
}

export function createCopyId(topicId, variantType, copyText) {
  return createStableId("copy", [topicId, variantType, hashText(copyText)]);
}

export function createTaskId(date, accountId, copyId) {
  return createStableId("task", [date, accountId || "no_account", copyId]);
}

export function createLedgerId(taskId, postedUrl) {
  return createStableId("ledger", [taskId, postedUrl || "manual"]);
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
