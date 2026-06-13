import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerSql, parseArgs } from "../scripts/app-create-customer.mjs";

test("customer create SQL provisions workspace manager lanes accounts and audit log", () => {
  const sql = buildCustomerSql({
    workspaceId: "workspace_acme",
    workspaceName: "Acme Team",
    managerEmail: "Owner@Example.com",
    managerName: "Acme Owner",
    accountCount: 2
  });

  assert.match(sql, /INSERT OR REPLACE INTO workspaces/);
  assert.match(sql, /'workspace_acme'/);
  assert.match(sql, /'owner@example.com'/);
  assert.match(sql, /INSERT OR REPLACE INTO workspace_members/);
  assert.match(sql, /INSERT OR IGNORE INTO content_lanes/);
  assert.match(sql, /INSERT OR REPLACE INTO workspace_lanes/);
  assert.match(sql, /workspace_acme_acct_01/);
  assert.match(sql, /workspace_acme_acct_02/);
  assert.match(sql, /INSERT OR REPLACE INTO publish_settings/);
  assert.match(sql, /customer\.create/);
  assert.doesNotMatch(sql, /access_token|refresh_token|client_secret|bearer/i);
});

test("customer create args cap accounts at 30 and normalize ids", () => {
  const args = parseArgs([
    "--workspace-name", "New Client LLC",
    "--manager-email", "Boss@Client.com",
    "--accounts", "100"
  ]);

  assert.equal(args.workspaceId, "workspace_new_client_llc");
  assert.equal(args.managerEmail, "boss@client.com");
  assert.equal(args.accountCount, 30);
  assert.equal(args.yes, false);
});
