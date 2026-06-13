import { createStableId, createToolId, todayString } from "./ids.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";
import { calculateEngagement, normalizeMetrics } from "./scoring.mjs";

export const DATA_FILES = {
  latest: "data/latest.json",
  history: "data/history.json",
  feedback: "data/feedback.json",
  queues: "data/queues.json",
  accountPosts: "data/account-posts.json",
  candidateInbox: "data/candidate-inbox.json",
  sourceCandidates: "data/source-candidates.json",
  affiliateResearch: "data/affiliate-research.json",
  reviewPages: "data/review-pages.json",
  affiliateLinks: "config/affiliate-links.json",
  xAccounts: "config/x-accounts.json",
  contentSources: "config/content-sources.json",
  voice: "config/voice.json"
};

export const DEFAULT_FEEDBACK = { version: 1, updatedAt: "", entries: [] };
export const DEFAULT_QUEUES = { version: 1, updatedAt: "", items: [] };
export const DEFAULT_ACCOUNT_POSTS = { version: 1, updatedAt: "", items: [] };
export const DEFAULT_CANDIDATE_INBOX = { version: 1, updatedAt: "", items: [] };
export const DEFAULT_SOURCE_CANDIDATES = { version: 1, updatedAt: "", items: [] };
export const DEFAULT_AFFILIATE_RESEARCH = { version: 1, updatedAt: "", items: [] };
export const DEFAULT_REVIEW_PAGES = { version: 1, updatedAt: "", items: [] };

export async function loadLatest() {
  return readJson(DATA_FILES.latest, null);
}

export async function loadHistoryData() {
  return readJson(DATA_FILES.history, { version: 1, tools: [] });
}

export async function loadFeedback() {
  return readJson(DATA_FILES.feedback, DEFAULT_FEEDBACK);
}

export async function saveFeedback(feedback) {
  await writeJsonAtomic(DATA_FILES.feedback, withUpdatedAt({ ...DEFAULT_FEEDBACK, ...feedback }));
}

export async function loadQueues() {
  return readJson(DATA_FILES.queues, DEFAULT_QUEUES);
}

export async function saveQueues(queues) {
  await writeJsonAtomic(DATA_FILES.queues, withUpdatedAt({ ...DEFAULT_QUEUES, ...queues }));
}

export async function loadAccountPosts() {
  return readJson(DATA_FILES.accountPosts, DEFAULT_ACCOUNT_POSTS);
}

export async function saveAccountPosts(accountPosts) {
  await writeJsonAtomic(DATA_FILES.accountPosts, withUpdatedAt({ ...DEFAULT_ACCOUNT_POSTS, ...accountPosts }));
}

export async function loadXAccountsConfig() {
  return readJson(DATA_FILES.xAccounts, { version: 1, rotationPolicy: {}, accounts: [] });
}

export async function loadCandidateInbox() {
  return readJson(DATA_FILES.candidateInbox, DEFAULT_CANDIDATE_INBOX);
}

export async function loadSourceCandidates() {
  return readJson(DATA_FILES.sourceCandidates, DEFAULT_SOURCE_CANDIDATES);
}

export async function saveCandidateInbox(inbox) {
  await writeJsonAtomic(DATA_FILES.candidateInbox, withUpdatedAt({ ...DEFAULT_CANDIDATE_INBOX, ...inbox }));
}

export async function loadAffiliateResearch() {
  return readJson(DATA_FILES.affiliateResearch, DEFAULT_AFFILIATE_RESEARCH);
}

export async function saveAffiliateResearch(data) {
  await writeJsonAtomic(DATA_FILES.affiliateResearch, withUpdatedAt({ ...DEFAULT_AFFILIATE_RESEARCH, ...data }));
}

export async function loadReviewPages() {
  return readJson(DATA_FILES.reviewPages, DEFAULT_REVIEW_PAGES);
}

export async function saveReviewPages(data) {
  await writeJsonAtomic(DATA_FILES.reviewPages, withUpdatedAt({ ...DEFAULT_REVIEW_PAGES, ...data }));
}

export async function loadAffiliateLinks() {
  return readJson(DATA_FILES.affiliateLinks, { links: [] });
}

export async function loadVoiceConfig() {
  return readJson(DATA_FILES.voice, { style: { avoid: [] } });
}

export function buildFeedbackEntry(input) {
  const now = new Date().toISOString();
  const toolId = input.toolId || createToolId(input.toolName, input.toolUrl);
  const variantType = input.variantType || "shortPost";
  const accountId = String(input.accountId || "").trim();
  const id = input.id || createStableId("feedback", [toolId, input.sourceDate || todayString(), variantType, accountId || "no_account", input.copyText || ""]);
  const metrics = normalizeMetrics(input.metrics);

  return {
    id,
    toolId,
    toolName: input.toolName,
    toolUrl: input.toolUrl,
    sourceDate: input.sourceDate || todayString(),
    variantType,
    accountId,
    accountName: input.accountName || "",
    sourceId: input.sourceId || "",
    sourceName: input.sourceName || "",
    sourceType: input.sourceType || "",
    circle: input.circle || "",
    candidateType: input.candidateType || "",
    taskId: input.taskId || "",
    copyId: input.copyId || "",
    needsLinking: Boolean(input.needsLinking),
    copyText: input.copyText || "",
    posted: input.posted ?? true,
    postedUrl: input.postedUrl || "",
    postedAt: input.postedAt || "",
    metrics,
    notes: input.notes || "",
    createdAt: input.createdAt || now,
    updatedAt: now,
    ...calculateEngagement(metrics)
  };
}

export async function upsertFeedback(input) {
  const feedback = await loadFeedback();
  const existing = input.id ? feedback.entries.find((item) => item.id === input.id) : null;
  const entry = buildFeedbackEntry(existing
    ? {
        ...existing,
        ...input,
        createdAt: existing.createdAt || input.createdAt,
        postedAt: input.postedAt || existing.postedAt
      }
    : input);
  const entries = feedback.entries.filter((item) => item.id !== entry.id);
  entries.push(entry);
  const next = { ...feedback, entries };
  await saveFeedback(next);
  return entry;
}

export async function deleteFeedback(id) {
  if (!id) throw new Error("feedback id is required");
  const feedback = await loadFeedback();
  const entries = feedback.entries.filter((entry) => entry.id !== id);
  const removed = entries.length !== feedback.entries.length;
  await saveFeedback({ ...feedback, entries });
  return { removed };
}

export function buildAccountPost(input) {
  const now = new Date().toISOString();
  const toolId = input.toolId || createToolId(input.toolName, input.toolUrl);
  const id = input.id || createStableId("account_post", [input.feedbackId || "", input.accountId || "", toolId, input.variantType || "shortPost"]);

  return {
    id,
    feedbackId: input.feedbackId || "",
    accountId: String(input.accountId || "").trim(),
    accountName: input.accountName || "",
    toolId,
    toolName: input.toolName,
    toolUrl: input.toolUrl,
    sourceDate: input.sourceDate || todayString(),
    variantType: input.variantType || "shortPost",
    copyText: input.copyText || "",
    postedUrl: input.postedUrl || "",
    postedAt: input.postedAt || now,
    status: input.status || "posted",
    notes: input.notes || "",
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export async function upsertAccountPost(input) {
  const accountPosts = await loadAccountPosts();
  const incoming = buildAccountPost(input);
  const existing = accountPosts.items.find((item) => item.id === incoming.id || (incoming.feedbackId && item.feedbackId === incoming.feedbackId));
  const saved = existing
    ? { ...existing, ...incoming, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }
    : incoming;
  const items = accountPosts.items.filter((item) => item.id !== saved.id && (!saved.feedbackId || item.feedbackId !== saved.feedbackId));
  items.push(saved);
  await saveAccountPosts({ ...accountPosts, items });
  return saved;
}

export async function upsertAccountPostFromFeedback(entry) {
  if (!entry?.posted || !entry.accountId) return null;
  return upsertAccountPost({
    feedbackId: entry.id,
    accountId: entry.accountId,
    accountName: entry.accountName,
    toolId: entry.toolId,
    toolName: entry.toolName,
    toolUrl: entry.toolUrl,
    sourceDate: entry.sourceDate,
    variantType: entry.variantType,
    copyText: entry.copyText,
    postedUrl: entry.postedUrl,
    postedAt: entry.postedAt || entry.updatedAt,
    notes: entry.notes
  });
}

export function buildQueueItem(input) {
  const now = new Date().toISOString();
  const toolId = input.toolId || createToolId(input.toolName, input.toolUrl);
  const type = input.type || "watch";
  const id = input.id || createStableId("queue", [toolId, type]);
  const sourceDates = Array.from(new Set([...(input.sourceDates ?? []), input.sourceDate].filter(Boolean)));

  return {
    id,
    toolId,
    toolName: input.toolName,
    toolUrl: input.toolUrl,
    sourceDates,
    type,
    status: input.status || "new",
    priorityScore: Number(input.priorityScore || 0),
    reason: input.reason || "",
    notes: input.notes || "",
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export async function upsertQueueItem(input) {
  const queues = await loadQueues();
  const incoming = buildQueueItem(input);
  const existing = queues.items.find((item) => item.toolId === incoming.toolId && item.type === incoming.type);
  let saved;

  if (existing) {
    saved = {
      ...existing,
      ...incoming,
      sourceDates: Array.from(new Set([...(existing.sourceDates ?? []), ...(incoming.sourceDates ?? [])])),
      priorityScore: Math.max(Number(existing.priorityScore || 0), Number(incoming.priorityScore || 0)),
      notes: [existing.notes, incoming.notes].filter(Boolean).join("\n").trim(),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
  } else {
    saved = incoming;
  }

  const items = queues.items.filter((item) => !(item.toolId === saved.toolId && item.type === saved.type));
  items.push(saved);
  await saveQueues({ ...queues, items });
  return saved;
}

export async function updateQueueStatus(id, status) {
  if (!id || !status) throw new Error("queue id and status are required");
  const queues = await loadQueues();
  const items = queues.items.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item);
  await saveQueues({ ...queues, items });
  return items.find((item) => item.id === id) ?? null;
}

export function buildCandidateItem(input) {
  const now = new Date().toISOString();
  const toolId = input.toolId || createToolId(input.name || input.toolName, input.url || input.toolUrl);
  const id = input.id || createStableId("candidate", [toolId]);

  return {
    id,
    toolId,
    name: String(input.name || input.toolName || "").trim(),
    url: String(input.url || input.toolUrl || "").trim(),
    tagline: String(input.tagline || "").trim(),
    description: String(input.description || input.tagline || "").trim(),
    source: String(input.source || "manual").trim(),
    sourceUrl: String(input.sourceUrl || "").trim(),
    circle: String(input.circle || "").trim(),
    candidateType: String(input.candidateType || "product").trim(),
    published: input.published || now,
    accountId: String(input.accountId || "").trim(),
    accountName: String(input.accountName || "").trim(),
    seedId: String(input.seedId || "").trim(),
    status: input.status || "active",
    notes: String(input.notes || "").trim(),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export async function upsertCandidate(input) {
  const inbox = await loadCandidateInbox();
  const incoming = buildCandidateItem(input);
  const existing = inbox.items.find((item) => item.id === incoming.id || item.toolId === incoming.toolId);
  const saved = existing
    ? { ...existing, ...incoming, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }
    : incoming;
  const items = inbox.items.filter((item) => item.id !== saved.id && item.toolId !== saved.toolId);
  items.push(saved);
  await saveCandidateInbox({ ...inbox, items });
  return saved;
}

export async function updateCandidateStatus(id, status) {
  if (!id || !status) throw new Error("candidate id and status are required");
  const inbox = await loadCandidateInbox();
  const items = inbox.items.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item);
  await saveCandidateInbox({ ...inbox, items });
  return items.find((item) => item.id === id) ?? null;
}

export async function upsertAffiliateResearch(input) {
  const data = await loadAffiliateResearch();
  const now = new Date().toISOString();
  const toolId = input.toolId || createToolId(input.toolName, input.toolUrl);
  const id = input.id || createStableId("affiliate_research", [toolId]);
  const existing = data.items.find((item) => item.id === id);
  const saved = {
    id,
    toolId,
    toolName: input.toolName || existing?.toolName,
    toolUrl: input.toolUrl || existing?.toolUrl,
    affiliateScore: Number(input.affiliateScore ?? existing?.affiliateScore ?? 0),
    status: input.status || existing?.status || "not_started",
    network: input.network ?? existing?.network ?? "",
    programUrl: input.programUrl ?? existing?.programUrl ?? "",
    affiliateLink: input.affiliateLink ?? existing?.affiliateLink ?? "",
    commissionNote: input.commissionNote ?? existing?.commissionNote ?? "",
    notes: input.notes ?? existing?.notes ?? "",
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const items = data.items.filter((item) => item.id !== id);
  items.push(saved);
  await saveAffiliateResearch({ ...data, items });
  return saved;
}

function withUpdatedAt(data) {
  return {
    ...data,
    updatedAt: new Date().toISOString()
  };
}
