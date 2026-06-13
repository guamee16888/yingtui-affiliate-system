import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTweetLength, assertTweetLength } from "../scripts/lib/tweet-length.mjs";

test("tweet length uses weighted X character counting", () => {
  const plain = analyzeTweetLength("hello");
  const withUrl = analyzeTweetLength("hello https://example.com");

  assert.equal(plain.weightedCharCount, 5);
  assert.equal(withUrl.weightedCharCount, 29);
  assert.equal(withUrl.fitsXPost, true);
});

test("tweet length blocks text over 280 weighted characters", () => {
  const analysis = analyzeTweetLength("a".repeat(281));

  assert.equal(analysis.weightedCharCount, 281);
  assert.equal(analysis.fitsXPost, false);
  assert.equal(analysis.status, "over_limit");
  assert.throws(() => assertTweetLength("a".repeat(281)), /281\/280/);
});

test("tweet length keeps safe limit separate from X hard limit", () => {
  const analysis = analyzeTweetLength("a".repeat(270));

  assert.equal(analysis.fitsXPost, true);
  assert.equal(analysis.fitsSafeLimit, false);
  assert.equal(analysis.status, "near_limit");
});
