import { assertTweetLength } from "../tweet-length.mjs";
import { createCopyId, createLedgerId, createStableId, createTaskId, todayString } from "../ids.mjs";
import { CORE_COLLECTIONS, loadCollection, saveCollection } from "../core-data.mjs";
import { readJson, writeJsonAtomic } from "../file-store.mjs";
import { DESKTOP_X_CREDENTIALS_PATH, DESKTOP_X_OAUTH_PATH } from "./constants.mjs";
import { appendDesktopAudit } from "./logging.mjs";
import { appendNote, upsertCollection } from "./internal.mjs";
import {
  emptyCredentialStore,
  ensureDesktopCredentialFresh,
  publishDesktopTweet,
  selectDesktopCredentialForAccount,
  upsertCredentialStore
} from "./x-api.mjs";

export async function createDesktopTask(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  const copyText = String(input.copyText || input.text || "").trim();
  if (!accountId) throw new Error("选择账号后再创建任务。");
  if (!copyText) throw new Error("请输入任务文案。");
  const length = assertTweetLength(copyText);
  const now = new Date();
  const today = todayString();
  const topicId = createStableId("topic", [workspaceId, accountId, copyText.slice(0, 80)]);
  const copyId = createCopyId(topicId, input.variantType || "desktop_manual", copyText);
  const taskId = input.taskId || createTaskId(today, accountId, copyId);
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const account = accounts.items.find((item) => item.accountId === accountId);
  if (!account) throw new Error(`账号不存在：${accountId}`);
  const task = {
    taskId,
    workspaceId,
    date: today,
    accountId,
    assignedTo: input.assignedTo || actor.userId || "user_owner",
    managerUserId: actor.userId || "user_owner",
    toolId: input.toolId || createStableId("tool", [workspaceId, accountId, "desktop_manual"]),
    toolName: input.toolName || "Desktop manual task",
    toolUrl: input.toolUrl || "",
    topicId,
    copyId,
    variantType: input.variantType || "desktop_manual",
    copyText,
    contentType: input.contentType || "post",
    hasLink: Boolean(input.hasLink),
    recommendedAt: input.recommendedAt || "",
    notes: input.notes || "",
    laneId: input.laneId || account.laneId || "",
    status: "pending_review",
    approvalStatus: "pending",
    publishMode: "manual",
    weightedCharCount: length.weightedCharCount,
    fitsTweetLimit: length.fitsXPost,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  await saveCollection(CORE_COLLECTIONS.postTasks, upsertCollection(tasks, task, "taskId"));
  await appendDesktopAudit({
    type: "task.create",
    workspaceId,
    actorUserId: actor.userId,
    targetId: taskId,
    summary: "Desktop manual task created.",
    metadata: { accountId, weightedCharCount: length.weightedCharCount }
  });
  return { task };
}

export async function markDesktopTaskPosted(input = {}, actor = { userId: "user_owner" }) {
  const taskId = String(input.taskId || "").trim();
  const postedUrl = String(input.postedUrl || "").trim();
  if (!taskId) throw new Error("taskId is required");
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  const ledger = await loadCollection(CORE_COLLECTIONS.postLedger);
  const task = tasks.items.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`任务不存在：${taskId}`);
  assertTweetLength(task.copyText || "");
  const now = new Date().toISOString();
  const nextTask = {
    ...task,
    status: "feedback_due",
    approvalStatus: task.approvalStatus === "pending" ? "approved" : task.approvalStatus,
    postedUrl,
    postedAt: input.postedAt || now,
    feedbackDueAt: input.feedbackDueAt || now,
    updatedAt: now,
    notes: appendNote(task.notes, input.notes || "Marked posted manually in Desktop.")
  };
  const ledgerEntry = {
    ledgerId: createLedgerId(taskId, postedUrl || now),
    workspaceId: nextTask.workspaceId || "workspace_default",
    taskId,
    accountId: nextTask.accountId || "",
    copyId: nextTask.copyId || "",
    toolId: nextTask.toolId || "",
    copyText: nextTask.copyText || "",
    postedUrl,
    postedAt: nextTask.postedAt,
    publishMode: "manual",
    actorUserId: actor.userId || "",
    createdAt: now,
    updatedAt: now
  };
  await Promise.all([
    saveCollection(CORE_COLLECTIONS.postTasks, { ...tasks, items: tasks.items.map((item) => item.taskId === taskId ? nextTask : item) }),
    saveCollection(CORE_COLLECTIONS.postLedger, upsertCollection(ledger, ledgerEntry, "ledgerId"))
  ]);
  await appendDesktopAudit({
    type: "task.mark_posted",
    workspaceId: nextTask.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: taskId,
    summary: "Task marked posted manually in Desktop."
  });
  return { task: nextTask, ledger: ledgerEntry };
}

export async function publishDesktopTaskToX(input = {}, actor = { userId: "user_owner" }, options = {}) {
  const taskId = String(input.taskId || "").trim();
  if (!taskId) throw new Error("taskId is required");
  const fetchImpl = options.fetchImpl || fetch;
  const nowDate = options.now instanceof Date ? options.now : new Date();
  const now = nowDate.toISOString();
  const [tasks, ledger, accounts, credentials, oauthConfig] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    readJson(DESKTOP_X_CREDENTIALS_PATH, emptyCredentialStore()),
    readJson(DESKTOP_X_OAUTH_PATH, null)
  ]);
  const task = tasks.items.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`任务不存在：${taskId}`);
  if (task.approvalStatus !== "approved") throw new Error("先确认任务，再发布到 X。");
  if (["posted", "feedback_due", "feedback_done", "skipped"].includes(task.status || "") || task.postedUrl) {
    throw new Error("这条任务已经发布过了。");
  }
  assertTweetLength(task.copyText || "");
  const accountId = String(task.accountId || "").trim();
  const account = accounts.items.find((item) => item.accountId === accountId) || {};
  const selected = selectDesktopCredentialForAccount(accountId, credentials, oauthConfig);
  if (!selected?.credential?.accessTokenRef) {
    throw new Error(`${account.handle || account.persona || accountId || "这个账号"} 还没有 X API 授权，请先连接该账号。`);
  }
  const fresh = await ensureDesktopCredentialFresh({
    credential: selected.credential,
    oauthConfig,
    fetchImpl,
    now: nowDate
  });
  const published = await publishDesktopTweet(task.copyText || "", fresh.credential.accessTokenRef, fetchImpl);
  const postedUrl = published.url || (published.id ? `https://x.com/i/web/status/${published.id}` : "");
  const nextTask = {
    ...task,
    status: "feedback_due",
    approvalStatus: "approved",
    postedUrl,
    xPostId: published.id || "",
    postedAt: now,
    feedbackDueAt: now,
    publishMode: "x_api",
    updatedAt: now,
    notes: appendNote(task.notes, input.notes || "Published to X from AI Creator OS Desktop.")
  };
  const ledgerEntry = {
    ledgerId: createLedgerId(taskId, postedUrl || now),
    workspaceId: nextTask.workspaceId || "workspace_default",
    taskId,
    accountId,
    copyId: nextTask.copyId || "",
    toolId: nextTask.toolId || "",
    copyText: nextTask.copyText || "",
    postedUrl,
    xPostId: published.id || "",
    postedAt: now,
    publishMode: "x_api",
    actorUserId: actor.userId || "",
    createdAt: now,
    updatedAt: now
  };
  const writes = [
    saveCollection(CORE_COLLECTIONS.postTasks, { ...tasks, items: tasks.items.map((item) => item.taskId === taskId ? nextTask : item) }),
    saveCollection(CORE_COLLECTIONS.postLedger, upsertCollection(ledger, ledgerEntry, "ledgerId"))
  ];
  if (fresh.changed) {
    writes.push(writeJsonAtomic(DESKTOP_X_CREDENTIALS_PATH, upsertCredentialStore(credentials, fresh.credential, now)));
    if (oauthConfig?.authorizedAccountId === accountId) {
      writes.push(writeJsonAtomic(DESKTOP_X_OAUTH_PATH, {
        ...oauthConfig,
        accessTokenRef: fresh.credential.accessTokenRef,
        refreshTokenRef: fresh.credential.refreshTokenRef || oauthConfig.refreshTokenRef || "",
        tokenType: fresh.credential.tokenType || oauthConfig.tokenType || "bearer",
        tokenExpiresAt: fresh.credential.tokenExpiresAt || "",
        updatedAt: now
      }));
    }
  }
  await Promise.all(writes);
  await appendDesktopAudit({
    type: "task.publish_x",
    workspaceId: nextTask.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: taskId,
    summary: "Task published to X from Desktop.",
    metadata: { accountId, xPostId: published.id || "" }
  });
  return { task: nextTask, ledger: ledgerEntry, postedUrl, xPostId: published.id || "" };
}
