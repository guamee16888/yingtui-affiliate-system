import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createD1StorageAdapter } from "../scripts/lib/d1-storage-adapter.mjs";

test("JSON audit log file keeps expected structure", async () => {
  const audit = JSON.parse(await readFile("data/audit-logs.json", "utf8"));
  assert.equal(typeof audit.version, "number");
  assert.ok(Array.isArray(audit.items));
});

test("D1 adapter writeAuditLog stores actor, workspace, action, entity, metadata, and timestamp", async () => {
  const rows = [];
  const adapter = createD1StorageAdapter({
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              const columns = sql.match(/insert into audit_logs\s*\(([\s\S]*?)\)\s*values/i)[1]
                .split(",")
                .map((column) => column.trim());
              rows.push(Object.fromEntries(columns.map((column, index) => [column, params[index]])));
              return { success: true };
            }
          };
        }
      };
    }
  });
  const audit = await adapter.writeAuditLog({
    workspaceId: "workspace_a",
    actorUserId: "user_manager",
    actorRole: "manager",
    action: "task.approve",
    entityType: "post_task",
    entityId: "task_1",
    metadata: { source: "test" },
    createdAt: "2026-06-13T00:00:00.000Z"
  });
  assert.equal(rows.length, 1);
  assert.equal(audit.workspaceId, "workspace_a");
  assert.equal(audit.actorUserId, "user_manager");
  assert.equal(audit.actorRole, "manager");
  assert.equal(audit.action, "task.approve");
  assert.equal(audit.entityType, "post_task");
  assert.equal(audit.entityId, "task_1");
  assert.deepEqual(audit.metadata, { source: "test" });
  assert.equal(audit.createdAt, "2026-06-13T00:00:00.000Z");
});
