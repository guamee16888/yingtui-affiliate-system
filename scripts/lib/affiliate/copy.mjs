function cleanSlot(value, voice) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  for (const phrase of voice.style.avoid ?? []) {
    text = text.replace(new RegExp(escapeRegExp(phrase), "ig"), "").replace(/\s+/g, " ").trim();
  }
  return text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fillTemplate(template, item, voice, link) {
  const values = {
    name: cleanSlot(item.tool.name, voice),
    audience: cleanSlot(item.angle.audience, voice),
    pain: cleanSlot(item.angle.pain, voice),
    solution: cleanSlot(item.angle.solution, voice),
    outcome: cleanSlot(item.angle.outcome, voice),
    sourceName: cleanSlot(item.tool.sourceName || "the feed", voice),
    link
  };

  return Object.entries(values).reduce((text, [key, value]) => {
    return text.replaceAll(`{${key}}`, value);
  }, template)
    .replace(/\.{4,}/g, "...")
    .replace(/\.{3}\s+\./g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

export function lintTweet(tweet, voice) {
  const lower = tweet.toLowerCase();
  const banned = (voice.style.avoid ?? []).filter((phrase) => lower.includes(phrase.toLowerCase()));
  const xLength = String(tweet ?? "").trim().length;
  const tooLong = xLength > maxTweetCharacters(voice);
  const emojiUsed = voice.style.allowEmoji ? false : /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(tweet);

  return {
    ok: banned.length === 0 && !tooLong && !emojiUsed,
    banned,
    tooLong,
    emojiUsed,
    length: xLength
  };
}

function maxTweetCharacters(voice) {
  const configured = Number(voice.style?.maxTweetCharacters ?? 280);
  return Math.min(280, Number.isFinite(configured) && configured > 0 ? configured : 280);
}

function fitTweetWithinLimit(text, voice, link) {
  const max = maxTweetCharacters(voice);
  let candidate = String(text ?? "").replace(/\s+/g, " ").trim();
  if (candidate.length <= max) return candidate;

  const cleanLink = String(link ?? "").trim();
  if (cleanLink && candidate.includes(cleanLink)) {
    const linkPart = ` ${cleanLink}`;
    const bodyLimit = max - linkPart.length;
    if (bodyLimit >= 32) {
      const body = candidate.replace(cleanLink, "").replace(/\s+/g, " ").trim();
      candidate = `${trimToLimit(body, bodyLimit)}${linkPart}`.trim();
    }
  }

  return trimToLimit(candidate, max);
}

function trimToLimit(text, max) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  if (max <= 3) return clean.slice(0, Math.max(0, max));

  const base = clean.slice(0, max - 3).trimEnd();
  const lastSpace = base.lastIndexOf(" ");
  const cut = lastSpace >= 24 ? base.slice(0, lastSpace) : base;
  return `${cut.replace(/(\.{3}|[.,;:!?-])+$/g, "")}...`.slice(0, max);
}

function fitAndLint(text, item, voice, link) {
  let candidate = String(text ?? "").replace(/\s+/g, " ").trim();
  let lint = lintTweet(candidate, voice);
  if (lint.tooLong) {
    candidate = fitTweetWithinLimit(candidate, voice, link);
    lint = lintTweet(candidate, voice);
  }
  return { candidate, lint };
}

function ensureTweet(text, item, voice, link) {
  let { candidate, lint } = fitAndLint(text, item, voice, link);

  if (lint.banned.length) {
    for (const phrase of lint.banned) {
      candidate = candidate.replace(new RegExp(escapeRegExp(phrase), "ig"), "").replace(/\s+/g, " ").trim();
    }
    ({ candidate, lint } = fitAndLint(candidate, item, voice, link));
  }

  if (!lint.ok) {
    candidate = item.tool.candidateType === "topic"
      ? `${item.tool.name}: useful signal, but not a tool review. I would verify the details before posting more. ${link}`
      : `${item.tool.name}: ${item.angle.pain}. I'd test it once before writing more. ${link}`;
    ({ candidate, lint } = fitAndLint(candidate, item, voice, link));
  }

  if (!lint.ok) {
    candidate = item.tool.candidateType === "topic"
      ? `Worth watching: ${item.tool.name}. Treat it as a signal, not a claim. ${link}`
      : `Worth testing: ${item.tool.name}. Narrow problem, clear buyer. ${link}`;
    ({ candidate, lint } = fitAndLint(candidate, item, voice, link));
  }

  return {
    text: candidate,
    lint
  };
}

export function makeCopyVariants(item, voice) {
  const link = item.affiliate?.affiliateUrl ?? item.tool.url;
  const isTopic = item.tool.candidateType === "topic";
  const templates = isTopic ? {
    shortPost: "Worth watching: {name}. I would not treat it as a tool review. The useful angle is what it says about {audience}. {link}",
    casualPost: "Saving this from {sourceName}. Not a recommendation, more of a market signal: {solution}. I would verify the details before posting a stronger take. {link}",
    contrarianAngle: "Most people will repeat the headline. The better post is probably the second-order question: what changes for {audience}? {link}",
    painPointHook: "The hook here is not the news itself. It is the pain underneath: {pain}. Worth watching before turning it into a thread. {link}",
    threadOpening: "If I turned this into a thread, I would keep it sober: who is affected, what changed, what is still uncertain, and whether builders can act on it. {link}"
  } : {
    shortPost: "Testing {name} today. It looks narrow enough to be useful: {pain}. Worth a quick look if you care about {outcome}. {link}",
    casualPost: "I like AI tools more when the buyer is obvious. {name} seems built for {audience}, not everyone. I'd test setup, pricing, and one real use case first. {link}",
    contrarianAngle: "Hot take: broad AI tools are harder to write about. {name} is smaller, which may be better. Clear buyer, clear pain, easier comparison. {link}",
    painPointHook: "People actually search for ways to fix {pain}. That's why {name} is more interesting than another vague launch. {link}",
    threadOpening: "I found {name} on Product Hunt and would not judge it by the launch copy. I'd test 4 things: the problem, the workflow, the pricing, and the closest alternative. {link}"
  };

  return Object.entries(templates).map(([label, template]) => ({
    label,
    ...ensureTweet(fillTemplate(template, item, voice, link), item, voice, link)
  }));
}

export function summarizeLint(lint) {
  if (lint.ok) return `OK (${lint.length} chars)`;
  const issues = [];
  if (lint.tooLong) issues.push(`${lint.length} chars`);
  if (lint.banned.length) issues.push(`banned: ${lint.banned.join(", ")}`);
  if (lint.emojiUsed) issues.push("emoji not allowed");
  return issues.join("; ");
}

export function buildAffiliateStatus(item) {
  if (item.affiliate) {
    return {
      text: `[Affiliate link configured](${item.affiliate.affiliateUrl}) (${item.affiliate.note ?? "matched"})`,
      hasLink: true
    };
  }

  return {
    text: "No affiliate link yet — research needed",
    hasLink: false
  };
}
