export function evaluateSourceCandidateQuality(item, source = {}) {
  const text = sourceQualityText(item);
  const noisyTerms = [
    "price prediction",
    "resistance",
    "bottomed",
    "war",
    "crime",
    "lawsuit",
    "live updates",
    "really bottomed",
    "climbs back",
    "rockets",
    "bulls",
    "trump",
    "iran",
    "froze",
    "laundering"
  ];
  const blockedTerms = [
    ...noisyTerms.filter((term) => hasSourceQualityTerm(text, term)),
    ...(source.excludeKeywords ?? []).map((term) => String(term).toLowerCase()).filter((term) => hasSourceQualityTerm(text, term))
  ];

  if (blockedTerms.length) {
    return {
      status: "noise",
      isNoisy: true,
      reason: `Blocked by source noise term: ${blockedTerms[0]}.`,
      blockedTerms,
      matchedTerms: []
    };
  }

  const circle = String(item.circle || source.circle || "").toLowerCase();
  const sourceName = String(source.name || item.sourceName || item.source || "").toLowerCase();
  const isCryptoSource = circle === "crypto_builders" || sourceName.includes("coindesk") || sourceName.includes("crypto");

  if (isCryptoSource) {
    const matchedTerms = CRYPTO_BUILDER_TERMS.filter((term) => hasSourceQualityTerm(text, term));
    const blockedMarketTerms = CRYPTO_MARKET_NOISE_TERMS.filter((term) => hasSourceQualityTerm(text, term));
    const hasBuilderAngle = CRYPTO_BUILDER_ANGLE_TERMS.some((term) => hasSourceQualityTerm(text, term));

    if (!matchedTerms.length) {
      return {
        status: "noise",
        isNoisy: true,
        reason: "Crypto source item lacks a crypto or builder-facing angle.",
        blockedTerms: blockedMarketTerms,
        matchedTerms
      };
    }

    if (blockedMarketTerms.length && !hasBuilderAngle) {
      return {
        status: "noise",
        isNoisy: true,
        reason: `Crypto source item looks market-only, not builder-facing: ${blockedMarketTerms[0]}.`,
        blockedTerms: blockedMarketTerms,
        matchedTerms
      };
    }

    return {
      status: "ok",
      isNoisy: false,
      reason: matchedTerms.length ? `Matched crypto/source terms: ${matchedTerms.slice(0, 3).join(", ")}.` : "Passed source quality gate.",
      blockedTerms: [],
      matchedTerms
    };
  }

  return {
    status: "ok",
    isNoisy: false,
    reason: "Passed source quality gate.",
    blockedTerms: [],
    matchedTerms: []
  };
}

const CRYPTO_BUILDER_TERMS = [
  "crypto",
  "bitcoin",
  "btc",
  "ethereum",
  "eth",
  "ether",
  "solana",
  "sol",
  "onchain",
  "blockchain",
  "defi",
  "wallet",
  "token",
  "stablecoin",
  "web3",
  "protocol",
  "exchange",
  "etf",
  "bnb",
  "arbitrum",
  "base",
  "polygon",
  "smart contract",
  "custody",
  "staking",
  "airdrop",
  "dao",
  "dex",
  "liquidity",
  "rwa",
  "usdc",
  "usdt",
  "coinbase",
  "binance"
];

const CRYPTO_BUILDER_ANGLE_TERMS = [
  "developer",
  "api",
  "sdk",
  "tool",
  "tooling",
  "dashboard",
  "infrastructure",
  "protocol",
  "founder",
  "product",
  "launch",
  "wallet",
  "exchange",
  "etf",
  "stablecoin",
  "custody",
  "analytics",
  "compliance",
  "onchain",
  "smart contract"
];

const CRYPTO_MARKET_NOISE_TERMS = [
  "nasdaq",
  "ipo",
  "stock",
  "stocks",
  "shares",
  "earnings",
  "wall street",
  "spacex",
  "tesla",
  "musk",
  "price",
  "bulls",
  "bearish",
  "rally",
  "soars",
  "plunges"
];

function sourceQualityText(item) {
  return normalizeSourceQualityText(`${item.name ?? ""} ${item.description ?? ""} ${item.tagline ?? ""}`);
}

function normalizeSourceQualityText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSourceQualityTerm(text, term) {
  const normalizedTerm = normalizeSourceQualityText(term);
  if (!normalizedTerm) return false;
  return ` ${text} `.includes(` ${normalizedTerm} `);
}

export function daysSince(published, date) {
  const base = new Date(`${date}T12:00:00Z`);
  const time = new Date(published);
  if (Number.isNaN(base.getTime()) || Number.isNaN(time.getTime())) return null;
  return Math.max(0, (base.getTime() - time.getTime()) / 86400000);
}
