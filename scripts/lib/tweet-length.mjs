import twitterText from "twitter-text";

export const X_MAX_WEIGHTED_CHARACTERS = 280;
export const DEFAULT_SAFE_TWEET_LIMIT = 260;

export function analyzeTweetLength(text, options = {}) {
  const value = String(text ?? "");
  const maxCharacters = Number(options.maxCharacters ?? X_MAX_WEIGHTED_CHARACTERS);
  const safeLimit = Number(options.safeLimit ?? DEFAULT_SAFE_TWEET_LIMIT);
  const parsed = twitterText.parseTweet(value);
  const weightedCharCount = Number(parsed.weightedLength || 0);
  const fitsXPost = Boolean(parsed.valid) && weightedCharCount <= maxCharacters;
  const fitsSafeLimit = weightedCharCount <= safeLimit;

  return {
    text: value,
    weightedCharCount,
    maxCharacters,
    safeLimit,
    remaining: maxCharacters - weightedCharCount,
    safeRemaining: safeLimit - weightedCharCount,
    fitsXPost,
    fitsAutoPost: fitsXPost,
    fitsSafeLimit,
    status: lengthStatus({ weightedCharCount, maxCharacters, safeLimit, fitsXPost }),
    validRangeStart: parsed.validRangeStart,
    validRangeEnd: parsed.validRangeEnd,
    displayRangeStart: parsed.displayRangeStart,
    displayRangeEnd: parsed.displayRangeEnd
  };
}

export function assertTweetLength(text, options = {}) {
  const analysis = analyzeTweetLength(text, options);
  if (!analysis.fitsXPost) {
    throw new Error(`Tweet text is ${analysis.weightedCharCount}/${analysis.maxCharacters} weighted characters.`);
  }
  return analysis;
}

function lengthStatus({ weightedCharCount, maxCharacters, safeLimit, fitsXPost }) {
  if (!fitsXPost) return "over_limit";
  if (weightedCharCount > safeLimit) return "near_limit";
  if (weightedCharCount > Math.floor(maxCharacters * 0.85)) return "watch";
  return "ok";
}
