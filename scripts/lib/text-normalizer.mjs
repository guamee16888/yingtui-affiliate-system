import { createHash } from "node:crypto";

export function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{Letter}\p{Number}\s'".-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashText(text) {
  return createHash("sha1").update(normalizeText(text)).digest("hex").slice(0, 16);
}

export function extractExternalLinks(text) {
  return [...String(text ?? "").matchAll(/https?:\/\/[^\s)]+/gi)]
    .map((match) => match[0].replace(/[.,;!?]+$/, ""));
}

export function createSimilarityFingerprint(text) {
  const tokens = normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const shingles = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    shingles.add(tokens[index]);
    if (tokens[index + 1]) shingles.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return [...shingles].sort();
}

export function similarityScore(textA, textB) {
  const a = new Set(createSimilarityFingerprint(textA));
  const b = new Set(createSimilarityFingerprint(textB));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}
