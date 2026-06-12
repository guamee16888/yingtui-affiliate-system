export function realAffiliateLinks(affiliateLinks = { links: [] }) {
  return (affiliateLinks.links ?? []).filter(isRealAffiliateLink);
}

export function isRealAffiliateLink(link) {
  const affiliateUrl = String(link?.affiliateUrl ?? "").trim();
  if (!affiliateUrl) return false;

  const haystack = [
    affiliateUrl,
    link?.match,
    link?.note,
    ...(Array.isArray(link?.keywords) ? link.keywords : []),
    ...(Array.isArray(link?.domains) ? link.domains : [])
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\b(example|placeholder|todo)\b/i.test(haystack)) return false;
  if (haystack.includes("your-id") || haystack.includes("your-real-id")) return false;
  if (haystack.includes("replace with your real")) return false;

  try {
    const parsed = new URL(affiliateUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function affiliateLinkMatchesTool(tool, link) {
  if (!isRealAffiliateLink(link)) return false;
  const haystack = `${tool?.name ?? tool?.toolName ?? ""} ${tool?.url ?? tool?.toolUrl ?? ""} ${tool?.description ?? ""} ${tool?.tagline ?? ""}`.toLowerCase();
  const terms = [
    link.match,
    ...(Array.isArray(link.keywords) ? link.keywords : []),
    ...(Array.isArray(link.domains) ? link.domains : [])
  ].filter(Boolean);

  return terms.some((term) => haystack.includes(String(term).toLowerCase()));
}
