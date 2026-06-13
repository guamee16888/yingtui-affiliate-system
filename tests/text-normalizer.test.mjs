import test from "node:test";
import assert from "node:assert/strict";
import { createSimilarityFingerprint, extractExternalLinks, hashText, normalizeText, similarityScore } from "../scripts/lib/text-normalizer.mjs";

test("normalizeText removes links and extra whitespace", () => {
  assert.equal(normalizeText("  Testing   Tool https://example.com/a  "), "testing tool");
});

test("hashText identifies same no-link copy", () => {
  assert.equal(hashText("Testing Tool https://a.com"), hashText("testing   tool https://b.com"));
});

test("similarityScore detects highly similar copy", () => {
  assert.equal(createSimilarityFingerprint("A narrow tool for SaaS founders").length > 0, true);
  assert.equal(similarityScore("A narrow tool for SaaS founders", "A narrow tool built for SaaS founders") > 0.5, true);
});

test("extractExternalLinks finds links in copy", () => {
  assert.deepEqual(extractExternalLinks("Try https://example.com/a, then https://x.com/b."), [
    "https://example.com/a",
    "https://x.com/b"
  ]);
});
