import { createToolId } from "../ids.mjs";

export function accountLooksLikeCircle(account, circle) {
  const text = `${account.displayName ?? ""} ${account.category ?? ""} ${account.accountId ?? ""}`.toLowerCase();
  const anchors = {
    ai_startups: ["ai tools", "ai founder", "ai startup", "ai agent", "agent ops", "sales support ai"],
    indie_hackers: ["indie", "build in public", "affiliate", "monetization", "side project"],
    saas_founders: ["saas", "b2b"],
    crypto_builders: ["crypto", "web3", "onchain", "wallet"]
  };
  return text.includes(circle.id.replace(/_/g, " "))
    || (anchors[circle.id] ?? []).some((anchor) => text.includes(anchor));
}

export function recommendedSourcesForCircle(config, circle) {
  return (config.sources ?? [])
    .filter((source) => source.circle === circle.id)
    .map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      enabled: source.enabled
    }));
}

export function searchQueriesForCircle(circle) {
  const defaults = {
    ai_startups: [
      "\"AI startup\" launch new tool",
      "\"AI agent\" founder workflow",
      "\"LLM\" \"Product Hunt\" launch",
      "\"AI automation\" \"pricing\" startup",
      "\"AI tool\" \"founder\" \"waitlist\""
    ],
    indie_hackers: [
      "\"micro SaaS\" launch",
      "\"indie hacker\" \"revenue\"",
      "\"build in public\" \"launched\"",
      "\"solo founder\" \"pricing\"",
      "\"side project\" \"SaaS\" \"users\""
    ],
    saas_founders: [
      "\"SaaS pricing\" \"case study\"",
      "\"B2B SaaS\" \"onboarding\"",
      "\"SaaS founder\" \"churn\"",
      "\"PLG\" \"activation\" \"SaaS\"",
      "\"SaaS\" \"pricing page\" \"launch\""
    ],
    crypto_builders: [
      "\"crypto wallet\" \"developer\"",
      "\"onchain\" \"tool\" launch",
      "\"DeFi\" \"dashboard\"",
      "\"stablecoin\" \"infrastructure\"",
      "\"web3\" \"founder\" \"product\""
    ]
  };

  return defaults[circle.id] ?? (circle.keywords ?? []).slice(0, 5).map((keyword) => `"${keyword}" startup tool`);
}

export function sourceSupplyQualityChecklist() {
  return [
    "Has a real URL, not only a vague trend.",
    "Clear buyer or audience.",
    "One narrow pain point.",
    "Fresh enough for X, or evergreen enough for a review page.",
    "Avoid pure price/news drama unless there is a builder or product angle."
  ];
}

export function roundRate(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function accountMatchesItem(account, item) {
  const text = `${item.tool?.name ?? ""} ${item.tool?.description ?? ""} ${item.tool?.circle ?? ""} ${item.angle?.audience ?? ""} ${item.angle?.outcome ?? ""}`.toLowerCase();
  return (account.keywords ?? []).some((keyword) => text.includes(String(keyword).toLowerCase()))
    || (account.contentPillars ?? []).some((pillar) => text.includes(String(pillar).toLowerCase()));
}

export function itemMatchesCircle(item, circle) {
  const text = `${item.tool?.name ?? ""} ${item.tool?.description ?? ""} ${item.tool?.circle ?? ""}`.toLowerCase();
  return text.includes(circle.id.replace(/_/g, " ")) || (circle.keywords ?? []).some((keyword) => text.includes(String(keyword).toLowerCase()));
}

export function uniqueByTool(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = item.toolId || createToolId(item.tool?.name, item.tool?.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
