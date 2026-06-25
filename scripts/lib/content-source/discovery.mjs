import { DEFAULT_CONTENT_SOURCE_CONFIG, normalizeContentSourceConfig } from "./config.mjs";
import {
  recommendedSourcesForCircle,
  searchQueriesForCircle
} from "./helpers.mjs";

export function buildSourceDiscoveryPack({ date, sourceQualityQueue = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const queueItems = sourceQualityQueue?.items?.length
    ? sourceQualityQueue.items
    : config.circles.map((circle) => ({
      circleId: circle.id,
      circleName: circle.name,
      neededCandidates: 5,
      currentQualifiedTools: 0,
      searchQueries: searchQueriesForCircle(circle),
      recommendedSources: recommendedSourcesForCircle(config, circle),
      importHint: `Find 5 fresh ${circle.name} candidates with clear buyer, narrow pain, and a real URL.`
    }));

  const circles = queueItems.map((item) => {
    const circle = config.circles.find((entry) => entry.id === item.circleId) ?? { id: item.circleId, name: item.circleName, keywords: [] };
    const queries = item.searchQueries?.length ? item.searchQueries : searchQueriesForCircle(circle);
    const primaryQueries = queries.slice(0, 4);

    return {
      circleId: item.circleId,
      circleName: item.circleName,
      priorityScore: Number(item.priorityScore || item.neededCandidates || 0),
      neededCandidates: Number(item.neededCandidates || 0),
      currentQualifiedTools: Number(item.currentQualifiedTools || 0),
      openingMove: sourceDiscoveryOpeningMove(item),
      importHint: item.importHint,
      searchLinks: primaryQueries.flatMap((query) => discoveryLinksForQuery(query, item.circleId)),
      sourceIdeas: sourceIdeasForCircle(item.circleId),
      configuredSources: item.recommendedSources ?? recommendedSourcesForCircle(config, circle),
      qualityChecklist: [
        "Has a real URL, not only a vague trend.",
        "Clear buyer or audience.",
        "One narrow pain point.",
        "Fresh enough for X, or evergreen enough for a review page.",
        "Avoid pure price/news drama unless there is a builder or product angle."
      ]
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.circleName.localeCompare(b.circleName));

  return {
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      circles: circles.length,
      totalNeededCandidates: circles.reduce((sum, item) => sum + item.neededCandidates, 0),
      totalSearchLinks: circles.reduce((sum, item) => sum + item.searchLinks.length, 0),
      topCircle: circles[0]?.circleName ?? ""
    },
    circles
  };
}

export function discoveryLinksForQuery(query, circleId) {
  const providers = [
    {
      label: "X live search",
      url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`
    },
    {
      label: "Google recent search",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${query} after:2026-01-01`)}`
    },
    {
      label: "HN Algolia",
      url: `https://hn.algolia.com/?q=${encodeURIComponent(query)}`
    }
  ];

  if (circleId === "ai_startups") {
    providers.push({ label: "Product Hunt search", url: `https://www.producthunt.com/search?q=${encodeURIComponent(query)}` });
  }
  if (circleId === "crypto_builders") {
    providers.push({ label: "CoinDesk search", url: `https://www.coindesk.com/search?s=${encodeURIComponent(query)}` });
  }

  return providers.map((provider) => ({
    ...provider,
    query,
    why: "Use this link for manual discovery. Import only candidates that pass the checklist."
  }));
}

function sourceDiscoveryOpeningMove(item) {
  const need = Number(item.neededCandidates || 0);
  if (need >= 25) return "Open the X and Google links first, collect 10 candidates, then narrow to 3 that have a concrete product or founder lesson.";
  if (need >= 10) return "Collect 5 candidates from search links, then import only the ones with a clear audience and URL.";
  return "Use this as a watchlist. Add only unusually strong candidates.";
}

function sourceIdeasForCircle(circleId) {
  const ideas = {
    ai_startups: [
      { name: "Product Hunt AI launches", url: "https://www.producthunt.com/topics/artificial-intelligence", why: "Good for new AI tools, but still needs pain/niche filtering." },
      { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/", why: "Useful for market signals and AI startup funding/product shifts." },
      { name: "Hacker News AI searches", url: "https://hn.algolia.com/?q=AI%20agent", why: "Good for technical/founder debates when filtered manually." }
    ],
    indie_hackers: [
      { name: "Indie Hackers products", url: "https://www.indiehackers.com/products", why: "Best for revenue, launch, and solo founder stories." },
      { name: "X build in public search", url: "https://x.com/search?q=%22build%20in%20public%22%20launched&src=typed_query&f=live", why: "Find fresh launches before they become saturated." },
      { name: "HN launch posts", url: "https://hn.algolia.com/?q=Show%20HN%20SaaS", why: "Useful for early products with founder context." }
    ],
    saas_founders: [
      { name: "SaaStr", url: "https://www.saastr.com/", why: "Evergreen B2B SaaS lessons for review threads and founder takes." },
      { name: "Lenny's Newsletter search", url: "https://www.google.com/search?q=site%3Alennysnewsletter.com%20SaaS%20pricing", why: "Good for pricing, growth, onboarding, and activation angles." },
      { name: "OpenView blog", url: "https://openviewpartners.com/blog/", why: "Useful PLG and B2B SaaS growth material." }
    ],
    crypto_builders: [
      { name: "CoinDesk", url: "https://www.coindesk.com/", why: "Use only product, infrastructure, ETF, stablecoin, or builder-facing items." },
      { name: "The Block", url: "https://www.theblock.co/", why: "Good for infrastructure and funding signals when not pure market noise." },
      { name: "X onchain tools search", url: "https://x.com/search?q=%22onchain%22%20%22tool%22%20launch&src=typed_query&f=live", why: "Find fresh builder tools and protocol launches." }
    ]
  };

  return ideas[circleId] ?? [];
}
