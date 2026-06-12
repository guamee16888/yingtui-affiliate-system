import { todayString } from "./ids.mjs";

const FIELD_ALIASES = {
  toolid: "toolId",
  tool: "toolName",
  toolname: "toolName",
  name: "toolName",
  toolurl: "toolUrl",
  url: "toolUrl",
  source: "toolUrl",
  sourcedate: "sourceDate",
  date: "sourceDate",
  variant: "variantType",
  varianttype: "variantType",
  angle: "variantType",
  account: "accountId",
  accountid: "accountId",
  xaccount: "accountId",
  xaccountid: "accountId",
  accountname: "accountName",
  copy: "copyText",
  copytext: "copyText",
  text: "copyText",
  post: "copyText",
  tweet: "copyText",
  tweettext: "copyText",
  posttext: "copyText",
  content: "copyText",
  body: "copyText",
  postedurl: "postedUrl",
  tweeturl: "postedUrl",
  tweetpermalink: "postedUrl",
  posturl: "postedUrl",
  xurl: "postedUrl",
  impressions: "impressions",
  impression: "impressions",
  likes: "likes",
  like: "likes",
  bookmarks: "bookmarks",
  bookmark: "bookmarks",
  replies: "replies",
  reply: "replies",
  reposts: "reposts",
  repost: "reposts",
  retweets: "reposts",
  shares: "reposts",
  clicks: "clicks",
  click: "clicks",
  linkclicks: "clicks",
  urlclicks: "clicks",
  engagementclicks: "clicks",
  profilevisits: "profileVisits",
  profilevisit: "profileVisits",
  profileclicks: "profileVisits",
  notes: "notes",
  note: "notes"
};

const METRIC_KEYS = ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(input);

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      pushRow(rows, row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  pushRow(rows, row);
  return rows;
}

export function mapFeedbackCsv(text, { latest = null, feedback = null } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { entries: [], errors: ["Paste needs a header row and at least one data row."] };

  const headers = rows[0].map(normalizeHeader);
  const entries = [];
  const errors = [];

  rows.slice(1).forEach((row, index) => {
    const raw = {};
    headers.forEach((header, headerIndex) => {
      if (header) raw[header] = row[headerIndex] ?? "";
    });

    const matchedFeedback = findFeedback(raw, feedback);
    const matchedTool = findTool(raw, latest, matchedFeedback);
    const variantType = raw.variantType || matchedFeedback?.variantType || "shortPost";
    const copyText = raw.copyText || matchedFeedback?.copyText || matchedTool?.copyVariants?.[variantType] || matchedTool?.copyVariants?.shortPost || "";
    const toolName = raw.toolName || matchedFeedback?.toolName || matchedTool?.name || "";
    const toolUrl = raw.toolUrl || matchedFeedback?.toolUrl || matchedTool?.url || "";

    if (!toolName || !toolUrl || !copyText) {
      errors.push(`Row ${index + 2}: toolName/toolUrl/copyText could not be resolved. Include toolName, or paste rows for posts already marked as sent.`);
      return;
    }

    entries.push({
      id: matchedFeedback?.id,
      toolId: raw.toolId || matchedFeedback?.toolId || matchedTool?.toolId,
      toolName,
      toolUrl,
      sourceDate: raw.sourceDate || latest?.date || todayString(),
      variantType,
      accountId: raw.accountId || matchedFeedback?.accountId || matchedTool?.accountRecommendation?.primary?.accountId || "",
      accountName: raw.accountName || matchedFeedback?.accountName || matchedTool?.accountRecommendation?.primary?.displayName || "",
      copyText,
      posted: true,
      postedUrl: raw.postedUrl || "",
      metrics: Object.fromEntries(METRIC_KEYS.map((key) => [key, toNumber(raw[key])])),
      notes: raw.notes || ""
    });
  });

  return { entries, errors };
}

function pushRow(rows, row) {
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
}

function normalizeHeader(header) {
  const key = String(header ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return FIELD_ALIASES[key] ?? key;
}

function findTool(raw, latest, matchedFeedback = null) {
  const tools = latest?.tools ?? [];
  if (raw.toolId) {
    const byId = tools.find((tool) => tool.toolId === raw.toolId);
    if (byId) return byId;
  }

  const name = String(raw.toolName ?? "").toLowerCase();
  if (name) {
    return tools.find((tool) => String(tool.name).toLowerCase() === name)
      || tools.find((tool) => String(tool.name).toLowerCase().includes(name) || name.includes(String(tool.name).toLowerCase()));
  }

  if (matchedFeedback?.toolId) {
    return tools.find((tool) => tool.toolId === matchedFeedback.toolId) ?? null;
  }

  if (raw.copyText) {
    const copy = normalizeText(raw.copyText);
    return tools.find((tool) => Object.values(tool.copyVariants ?? {}).some((variant) => textsOverlap(copy, normalizeText(variant)))) ?? null;
  }

  return null;
}

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[,%]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function detectDelimiter(input) {
  const firstLine = String(input ?? "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function findFeedback(raw, feedback) {
  const entries = feedback?.entries ?? [];
  if (!entries.length) return null;

  if (raw.postedUrl) {
    const postedUrl = normalizeUrl(raw.postedUrl);
    const match = entries.find((entry) => normalizeUrl(entry.postedUrl) === postedUrl);
    if (match) return match;
  }

  if (raw.copyText) {
    const copy = normalizeText(raw.copyText);
    return entries.find((entry) => textsOverlap(copy, normalizeText(entry.copyText))) ?? null;
  }

  return null;
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/\/$/, "");
}

function textsOverlap(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b.slice(0, 80)) || b.includes(a.slice(0, 80));
}
