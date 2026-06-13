import { publishToX } from "./x-publish.mjs";

export async function publishXPost({ task, account, connection, dryRun = true, live = false, env = process.env }) {
  const text = String(task?.copyText || task?.tweetText || "").trim();
  const handle = connection?.handle || account?.handle || "";
  if (!text) return { ok: false, error: "Post text is empty." };
  if (dryRun || !live) {
    return {
      ok: true,
      dryRun: true,
      xPostId: "",
      postedUrl: handle ? `https://x.com/${handle.replace(/^@/, "")}/status/dry-run` : "",
      requestSummary: {
        accountId: account?.accountId || task?.accountId || "",
        weightedCharCount: task?.weightedCharCount || text.length,
        textPreview: text.slice(0, 80)
      }
    };
  }
  if (!connection || connection.status !== "connected") {
    return { ok: false, error: "X connection is not connected." };
  }
  try {
    const result = await publishToX({
      text,
      confirmed: true,
      accountId: task.accountId
    }, env);
    const xPostId = result.id || "";
    return {
      ok: true,
      dryRun: false,
      xPostId,
      postedUrl: handle && xPostId ? `https://x.com/${handle.replace(/^@/, "")}/status/${xPostId}` : result.url || "",
      responseSummary: {
        id: xPostId,
        textLength: String(result.text || text).length
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
