export function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function calculateEngagement(metrics = {}) {
  const impressions = safeNumber(metrics.impressions);
  const likes = safeNumber(metrics.likes);
  const bookmarks = safeNumber(metrics.bookmarks);
  const replies = safeNumber(metrics.replies);
  const reposts = safeNumber(metrics.reposts);
  const clicks = safeNumber(metrics.clicks);
  const profileVisits = safeNumber(metrics.profileVisits);
  const engagementScore =
    likes * 1
    + bookmarks * 3
    + replies * 4
    + reposts * 5
    + clicks * 4
    + profileVisits * 2
    + Math.min(impressions / 100, 20);

  return {
    engagementScore: round(engagementScore),
    engagementRate: rate(likes + bookmarks + replies + reposts + clicks, impressions),
    saveRate: rate(bookmarks, impressions),
    replyRate: rate(replies, impressions),
    clickRate: rate(clicks, impressions)
  };
}

export function normalizeMetrics(metrics = {}) {
  return {
    impressions: safeNumber(metrics.impressions),
    likes: safeNumber(metrics.likes),
    bookmarks: safeNumber(metrics.bookmarks),
    replies: safeNumber(metrics.replies),
    reposts: safeNumber(metrics.reposts),
    clicks: safeNumber(metrics.clicks),
    profileVisits: safeNumber(metrics.profileVisits)
  };
}

function rate(part, total) {
  const denominator = safeNumber(total);
  if (denominator === 0) return 0;
  return round(safeNumber(part) / denominator);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
