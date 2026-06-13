export const CONTENT_LANE_IDS = [
  "ai_startups",
  "indie_builders",
  "saas_founders",
  "crypto_builders"
];

const LANE_KEYWORDS = {
  ai_startups: [
    "ai",
    "agent",
    "agents",
    "automation",
    "copilot",
    "llm",
    "model apps",
    "prompt",
    "rag",
    "workflow"
  ],
  indie_builders: [
    "build in public",
    "developer workflow",
    "indie",
    "launch",
    "maker",
    "mrr",
    "revenue",
    "side project",
    "small tool",
    "solo founder"
  ],
  saas_founders: [
    "b2b",
    "churn",
    "founder operations",
    "onboarding",
    "plg",
    "pricing",
    "retention",
    "saas",
    "sales",
    "support"
  ],
  crypto_builders: [
    "crypto",
    "dashboard",
    "defi",
    "dev tooling",
    "infra",
    "onchain",
    "protocol",
    "security",
    "smart contract",
    "wallet",
    "web3"
  ]
};

export const CRYPTO_BLOCKED_TERMS = [
  "price prediction",
  "pump",
  "signal",
  "signals",
  "financial advice",
  "investment advice",
  "guaranteed returns",
  "leverage",
  "gambling",
  "100x",
  "buy now",
  "sell now"
];

export function classifyCandidate(candidate, contentLanes = []) {
  const validLaneIds = new Set(
    (contentLanes ?? [])
      .filter((lane) => lane.active !== false)
      .map((lane) => lane.laneId)
      .filter(Boolean)
  );
  const allowedLaneIds = validLaneIds.size ? validLaneIds : new Set(CONTENT_LANE_IDS);
  const hintedLaneIds = normalizeLaneHints(candidate).filter((laneId) => allowedLaneIds.has(laneId));
  const text = candidateText(candidate);
  const keywordScores = Object.entries(LANE_KEYWORDS)
    .filter(([laneId]) => allowedLaneIds.has(laneId))
    .map(([laneId, keywords]) => ({
      laneId,
      score: keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0)
    }));
  const scoreByLane = new Map(keywordScores.map((item) => [item.laneId, item.score]));
  for (const laneId of hintedLaneIds) {
    scoreByLane.set(laneId, (scoreByLane.get(laneId) ?? 0) + 3);
  }

  const maxScore = Math.max(0, ...scoreByLane.values());
  const laneIds = maxScore
    ? [...scoreByLane.entries()]
      .filter(([, score]) => score === maxScore || score >= 2)
      .sort((a, b) => b[1] - a[1] || CONTENT_LANE_IDS.indexOf(a[0]) - CONTENT_LANE_IDS.indexOf(b[0]))
      .map(([laneId]) => laneId)
    : hintedLaneIds;
  const riskFlags = classifyRiskFlags(candidate, laneIds);
  const confidence = laneIds.length ? Math.min(0.95, 0.45 + maxScore * 0.12 + hintedLaneIds.length * 0.15) : 0;
  return {
    laneIds: [...new Set(laneIds)],
    confidence: Number(confidence.toFixed(2)),
    riskFlags,
    reason: reasonFor({ laneIds, hintedLaneIds, maxScore, riskFlags })
  };
}

export function classifyRiskFlags(candidate, laneIds = []) {
  const flags = [];
  const text = candidateText(candidate);
  if (!laneIds.length) {
    flags.push({
      type: "candidate_without_lane",
      severity: "warn",
      message: "Candidate could not be classified into a content lane."
    });
  }
  if (laneIds.includes("crypto_builders")) {
    for (const term of CRYPTO_BLOCKED_TERMS) {
      if (text.includes(term)) {
        flags.push({
          type: "crypto_blocked_topic",
          severity: "block",
          term,
          message: `Crypto builder lane blocks '${term}'.`
        });
      }
    }
  }
  return flags;
}

function normalizeLaneHints(candidate) {
  return [...new Set([
    ...(candidate.laneIds ?? []),
    ...(candidate.laneHints ?? [])
  ].filter((laneId) => CONTENT_LANE_IDS.includes(laneId)))];
}

function candidateText(candidate) {
  return [
    candidate.title,
    candidate.name,
    candidate.summary,
    candidate.rawText,
    candidate.notes,
    candidate.url
  ].filter(Boolean).join(" ").toLowerCase();
}

function reasonFor({ laneIds, hintedLaneIds, maxScore, riskFlags }) {
  if (!laneIds.length) return "No strong lane keyword or lane hint matched.";
  const hintText = hintedLaneIds.length ? `lane hints (${hintedLaneIds.join(", ")})` : "keywords";
  const riskText = riskFlags.length ? `; ${riskFlags.length} risk flag(s)` : "";
  return `Matched ${laneIds.join(", ")} via ${hintText} with score ${maxScore}${riskText}.`;
}
