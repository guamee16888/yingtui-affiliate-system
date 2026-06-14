import assert from "node:assert/strict";
import test from "node:test";
import { createD1StorageAdapter } from "../scripts/lib/d1-storage-adapter.mjs";

test("D1 adapter reads workspace by id", async () => {
  const db = createFakeD1();
  const adapter = createD1StorageAdapter(db);
  const workspace = await adapter.getWorkspace("workspace_a");
  assert.equal(workspace.workspaceId, "workspace_a");
  assert.equal(workspace.name, "Workspace A");
  assert.equal(await adapter.getWorkspace("missing"), null);
});

test("D1 adapter listWorkspaceTasks is workspace scoped", async () => {
  const db = createFakeD1();
  const adapter = createD1StorageAdapter(db);
  const tasks = await adapter.listWorkspaceTasks("workspace_a");
  assert.deepEqual(tasks.map((task) => task.taskId), ["task_a_1", "task_a_2"]);
  assert.ok(tasks.every((task) => task.workspaceId === "workspace_a"));
});

test("D1 adapter listStaffTasks is workspace and user scoped", async () => {
  const db = createFakeD1();
  const adapter = createD1StorageAdapter(db);
  const tasks = await adapter.listStaffTasks("workspace_a", "user_staff");
  assert.deepEqual(tasks.map((task) => task.taskId), ["task_a_1"]);
});

test("D1 adapter updateTaskStatus checks workspace and writes audit log", async () => {
  const db = createFakeD1();
  const adapter = createD1StorageAdapter(db);
  const updated = await adapter.updateTaskStatus(
    "workspace_a",
    "task_a_1",
    { status: "approved", approvalStatus: "approved" },
    { userId: "user_manager", role: "manager" }
  );
  assert.equal(updated.status, "approved");
  assert.equal(db.tables.audit_logs.length, 1);
  assert.equal(db.tables.audit_logs[0].workspace_id, "workspace_a");
  assert.equal(db.tables.audit_logs[0].action, "task.approved");
  await assert.rejects(
    adapter.updateTaskStatus("workspace_b", "task_a_1", { status: "approved" }),
    /Task not found in workspace/
  );
});

test("D1 adapter appendLedgerEntry does not duplicate a task ledger", async () => {
  const db = createFakeD1();
  const adapter = createD1StorageAdapter(db);
  const first = await adapter.appendLedgerEntry("workspace_a", { taskId: "task_a_1", postedText: "Posted once" }, { userId: "user_staff" });
  const second = await adapter.appendLedgerEntry("workspace_a", { taskId: "task_a_1", postedText: "Posted twice" }, { userId: "user_staff" });
  assert.equal(first.ledgerId, second.ledgerId);
  assert.equal(db.tables.post_ledger.length, 1);
  assert.equal(db.tables.audit_logs.filter((row) => row.action === "ledger.append").length, 1);
});

test("D1 adapter upsertFeedback validates task workspace and writes audit log", async () => {
  const db = createFakeD1();
  const adapter = createD1StorageAdapter(db);
  const feedback = await adapter.upsertFeedback(
    "workspace_a",
    { feedbackId: "feedback_a_1", taskId: "task_a_1", metrics: { likes: 4 }, notes: "Good first signal" },
    { userId: "user_staff", role: "staff" }
  );
  assert.equal(feedback.feedbackId, "feedback_a_1");
  assert.equal(db.tables.feedback.length, 1);
  assert.equal(db.tables.audit_logs.at(-1).action, "feedback.upsert");
  await assert.rejects(
    adapter.upsertFeedback("workspace_b", { feedbackId: "bad", taskId: "task_a_1" }),
    /Task not found in workspace/
  );
});

test("D1 adapter reports a Discord identity already bound to another app user", async () => {
  const db = createFakeD1();
  db.tables.user_identities.push({
    identity_id: "identity_existing",
    user_id: "user_existing",
    provider: "discord",
    provider_user_id: "discord_1"
  });
  const adapter = createD1StorageAdapter(db);
  await assert.rejects(
    adapter.upsertUserIdentity({
      userId: "user_new",
      provider: "discord",
      providerUserId: "discord_1",
      username: "Manager"
    }),
    (error) => {
      assert.equal(error.code, "DISCORD_IDENTITY_ALREADY_BOUND");
      assert.equal(error.status, 409);
      return true;
    }
  );
});

function createFakeD1() {
  const tables = {
    workspaces: [
      {
        workspace_id: "workspace_a",
        name: "Workspace A",
        plan: "internal",
        account_limit: 30,
        publish_mode: "manual",
        auto_publish_enabled: 0,
        requires_final_approval: 1,
        status: "active",
        created_at: "2026-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z"
      }
    ],
    post_tasks: [
      taskRow({ task_id: "task_a_1", workspace_id: "workspace_a", assigned_to: "user_staff", created_at: "2026-06-13T02:00:00.000Z" }),
      taskRow({ task_id: "task_a_2", workspace_id: "workspace_a", assigned_to: "other_staff", created_at: "2026-06-13T01:00:00.000Z" }),
      taskRow({ task_id: "task_b_1", workspace_id: "workspace_b", assigned_to: "user_staff", created_at: "2026-06-13T03:00:00.000Z" })
    ],
    post_ledger: [],
    feedback: [],
    audit_logs: [],
    user_identities: []
  };
  return {
    tables,
    prepare(sql) {
      return new FakeStatement(tables, sql);
    }
  };
}

function taskRow(overrides) {
  return {
    task_id: "",
    workspace_id: "",
    account_id: "account_ai",
    assigned_to: "",
    manager_user_id: "user_manager",
    tool_id: "tool_1",
    topic_id: "topic_1",
    copy_id: "copy_1",
    copy_text: "A compact post under 280 characters.",
    status: "pending_review",
    approval_status: "pending",
    weighted_char_count: 36,
    duplicate_check_json: "{}",
    risk_flags_json: "[]",
    notes: "",
    created_at: "2026-06-13T00:00:00.000Z",
    updated_at: "2026-06-13T00:00:00.000Z",
    ...overrides
  };
}

class FakeStatement {
  constructor(tables, sql, params = []) {
    this.tables = tables;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.params = params;
  }

  bind(...params) {
    return new FakeStatement(this.tables, this.sql, params);
  }

  async first() {
    return (await this.all()).results[0] ?? null;
  }

  async all() {
    const lower = this.sql.toLowerCase();
    if (lower.includes("from workspaces")) {
      return { results: this.tables.workspaces.filter((row) => row.workspace_id === this.params[0]) };
    }
    if (lower.includes("from post_tasks")) {
      const rows = this.selectPostTasks(lower);
      return { results: rows };
    }
    if (lower.includes("from post_ledger")) {
      return {
        results: this.tables.post_ledger.filter((row) => row.workspace_id === this.params[0] && row.task_id === this.params[1])
      };
    }
    if (lower.includes("from user_identities")) {
      if (lower.includes("provider = ?") && lower.includes("provider_user_id = ?")) {
        const [provider, providerUserId] = this.params;
        return {
          results: this.tables.user_identities.filter((row) => row.provider === provider && row.provider_user_id === providerUserId)
        };
      }
      if (lower.includes("user_id = ?") && lower.includes("provider = ?")) {
        const [userId, provider] = this.params;
        return {
          results: this.tables.user_identities.filter((row) => row.user_id === userId && row.provider === provider)
        };
      }
      return { results: this.tables.user_identities };
    }
    return { results: [] };
  }

  async run() {
    const lower = this.sql.toLowerCase();
    if (lower.startsWith("update post_tasks set")) return this.updatePostTask();
    if (lower.startsWith("insert into post_ledger")) return this.insert("post_ledger");
    if (lower.startsWith("insert into feedback")) return this.upsert("feedback", "feedback_id");
    if (lower.startsWith("insert into audit_logs")) return this.insert("audit_logs");
    return { success: true };
  }

  selectPostTasks(lower) {
    let index = 0;
    let rows = [...this.tables.post_tasks];
    if (lower.includes("workspace_id = ?")) {
      const workspaceId = this.params[index++];
      rows = rows.filter((row) => row.workspace_id === workspaceId);
    }
    if (lower.includes("assigned_to = ?")) {
      const userId = this.params[index++];
      rows = rows.filter((row) => row.assigned_to === userId);
    }
    if (lower.includes("task_id = ?")) {
      const taskId = this.params[index++];
      rows = rows.filter((row) => row.task_id === taskId);
    }
    if (lower.includes("status = ?")) {
      const status = this.params[index++];
      rows = rows.filter((row) => row.status === status);
    }
    if (lower.includes("account_id = ?")) {
      const accountId = this.params[index++];
      rows = rows.filter((row) => row.account_id === accountId);
    }
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(a.task_id).localeCompare(String(b.task_id)));
  }

  updatePostTask() {
    const match = this.sql.match(/set (.*?) where workspace_id = \? and task_id = \?/i);
    const columns = match[1].split(",").map((part) => part.trim().split(/\s*=\s*/)[0]);
    const values = this.params.slice(0, columns.length);
    const workspaceId = this.params.at(-2);
    const taskId = this.params.at(-1);
    const row = this.tables.post_tasks.find((item) => item.workspace_id === workspaceId && item.task_id === taskId);
    if (row) {
      for (const [index, column] of columns.entries()) row[column] = values[index];
    }
    return { success: true };
  }

  insert(table) {
    this.tables[table].push(rowFromInsert(this.sql, this.params));
    return { success: true };
  }

  upsert(table, primaryKey) {
    const row = rowFromInsert(this.sql, this.params);
    const index = this.tables[table].findIndex((item) => item[primaryKey] === row[primaryKey]);
    if (index >= 0) this.tables[table][index] = { ...this.tables[table][index], ...row };
    else this.tables[table].push(row);
    return { success: true };
  }
}

function rowFromInsert(sql, params) {
  const match = sql.match(/insert into \w+\s*\(([\s\S]*?)\)\s*values/i);
  const columns = match[1].split(",").map((column) => column.trim());
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}
