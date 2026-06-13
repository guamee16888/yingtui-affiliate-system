import test from "node:test";
import assert from "node:assert/strict";
import { checkAccountRisk, checkCopyDuplicate, checkLinkRisk, checkTaskDuplicateRisk } from "../scripts/lib/duplicate-checker.mjs";
import { hashText, normalizeText } from "../scripts/lib/text-normalizer.mjs";

const copy = {
  copyId: "copy_1",
  toolId: "tool_1",
  copyText: "Testing a narrow SaaS tool https://tool.com",
  normalizedText: normalizeText("Testing a narrow SaaS tool https://tool.com"),
  normalizedTextHash: hashText("Testing a narrow SaaS tool https://tool.com")
};

test("published copy blocks reuse", () => {
  const check = checkCopyDuplicate({
    copy,
    ledger: [{ normalizedTextHash: copy.normalizedTextHash, postedText: "Testing a narrow SaaS tool https://other.com" }]
  });
  assert.equal(check.riskLevel, "block");
  assert.equal(check.recommendation, "block");
});

test("same copyId in active task blocks reuse", () => {
  const check = checkCopyDuplicate({
    copy,
    tasks: [{ copyId: "copy_1", status: "assigned" }]
  });
  assert.equal(check.flags.some((flag) => flag.type === "copy_active_task"), true);
  assert.equal(check.ok, false);
});

test("same account same tool within seven days blocks", () => {
  const check = checkAccountRisk({
    account: { accountId: "acc_1", status: "active", dailyPostLimit: 10, externalLinkLimit: 2 },
    task: { accountId: "acc_1", toolId: "tool_1", toolUrl: "https://tool.com", date: "2026-06-13", copyText: "copy" },
    ledger: [{ accountId: "acc_1", toolId: "tool_1", postedAt: "2026-06-11T00:00:00.000Z", externalLinks: ["https://tool.com"] }]
  });
  assert.equal(check.flags.some((flag) => flag.type === "account_same_tool_7d"), true);
  assert.equal(check.riskLevel, "block");
});

test("restricted account blocks task", () => {
  const check = checkAccountRisk({
    account: { accountId: "acc_1", status: "restricted" },
    task: { accountId: "acc_1", date: "2026-06-13" }
  });
  assert.equal(check.flags[0].type, "account_not_active");
  assert.equal(check.ok, false);
});

test("external link and affiliate limits block", () => {
  const linkCheck = checkLinkRisk({
    links: ["https://tool.com/path"],
    task: { date: "2026-06-13", toolUrl: "https://tool.com/path" },
    ledger: [
      { postedAt: "2026-06-13T01:00:00.000Z", externalLinks: ["https://tool.com/path"] },
      { postedAt: "2026-06-13T02:00:00.000Z", externalLinks: ["https://tool.com/path"] }
    ],
    contentRules: { rules: { maxSameDomainPerDayGlobal: 2 } }
  });
  assert.equal(linkCheck.riskLevel, "block");

  const affiliateCheck = checkLinkRisk({
    links: ["https://tool.com"],
    task: { date: "2026-06-13", affiliateLinkUsed: "https://tool.com/?ref=real" },
    ledger: [{ postedAt: "2026-06-13T01:00:00.000Z", affiliateLinkUsed: "https://tool.com/?ref=real" }],
    contentRules: { rules: { maxAffiliateLinkPerDayGlobal: 1 } }
  });
  assert.equal(affiliateCheck.flags.some((flag) => flag.type === "affiliate_link_global_limit"), true);
});

test("task duplicate risk merges blocking checks", () => {
  const check = checkTaskDuplicateRisk({
    task: {
      taskId: "task_1",
      status: "assigned",
      approvalStatus: "pending",
      accountId: "acc_1",
      date: "2026-06-13",
      copyId: "copy_1",
      copyText: copy.copyText
    },
    context: {
      copyLibrary: [copy],
      xAccounts: [{ accountId: "acc_1", status: "active", dailyPostLimit: 10 }],
      tasks: [],
      ledger: [],
      users: [],
      accountHealth: [],
      contentRules: { rules: {} }
    }
  });
  assert.equal(check.flags.some((flag) => flag.type === "task_not_approved"), true);
  assert.equal(check.riskLevel, "block");
});
