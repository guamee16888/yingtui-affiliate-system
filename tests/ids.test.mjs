import test from "node:test";
import assert from "node:assert/strict";
import { createAccountId, createCopyId, createLedgerId, createTaskId, createTopicId, createToolId } from "../scripts/lib/ids.mjs";
import { normalizeUrl } from "../scripts/lib/url-utils.mjs";

test("createAccountId is stable across case and @ prefix", () => {
  assert.equal(createAccountId("@AI_Tools_Lab"), createAccountId("ai_tools_lab"));
});

test("core IDs are stable for normalized inputs", () => {
  const toolId = createToolId("Tool Name", "https://example.com/path?utm_source=x");
  assert.equal(toolId, createToolId("Tool Name", "https://example.com/path"));
  const topicId = createTopicId(toolId, "shortPost", "Founders", "Too much manual work", "daily ops");
  assert.equal(topicId, createTopicId(toolId, "shortPost", " founders ", "too   much manual work", "daily ops"));
  const copyId = createCopyId(topicId, "shortPost", "Same copy   https://x.com/a");
  assert.equal(copyId, createCopyId(topicId, "shortPost", "same copy https://x.com/b"));
  assert.equal(createTaskId("2026-06-13", "acc", copyId), createTaskId("2026-06-13", "acc", copyId));
  assert.equal(createLedgerId("task_1", "https://x.com/a/status/1"), createLedgerId("task_1", "https://x.com/a/status/1"));
});

test("normalizeUrl removes tracking parameters", () => {
  assert.equal(
    normalizeUrl("https://www.example.com/path/?utm_source=x&ref=abc#top"),
    "https://example.com/path"
  );
});
