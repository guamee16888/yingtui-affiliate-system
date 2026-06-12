import { createStableId, slugify, todayString } from "./ids.mjs";

export function buildReviewOutline(tool, affiliateLink = null) {
  const title = `${tool.name} Review: Who It’s Actually For`;
  const cta = affiliateLink
    ? `Try ${tool.name}: ${affiliateLink}`
    : "Affiliate link not available yet — replace after approval.";
  const positioning = tool.angle?.audience && tool.angle?.pain
    ? `${tool.angle.audience} trying to solve ${tool.angle.pain}`
    : cleanSentence(tool.suggestedAngle ?? tool.reason ?? "a narrow workflow problem");

  return `# ${title}

## Working Title Options
- ${tool.name} Review: Who It’s Actually For
- ${tool.name} vs Doing It Manually
- Is ${tool.name} Worth Testing for ${tool.angle?.audience ?? "Its Target Users"}?

## Meta Description Draft
A practical review outline for ${tool.name}, focused on the problem it claims to solve, who should test it, and what needs manual verification before recommending it.

## One-line Positioning
${tool.name} appears to target ${positioning}.

## Problem This Tool Tries To Solve
${tool.angle?.pain ?? tool.tagline ?? "Research needed: summarize the concrete user pain after testing the product."}

## Who This Is For
- ${tool.angle?.audience ?? "Research needed"}
- People already trying to solve this workflow manually
- Buyers who can compare time saved against subscription cost

## Who This Is Not For
- People who only want a broad AI assistant
- Teams that need a fully verified enterprise workflow before testing
- Anyone expecting guaranteed revenue or guaranteed results

## Key Use Cases
- Test the core workflow described in the Product Hunt tagline
- Compare setup time against the current manual workaround
- Check whether the result is good enough to recommend publicly

## What To Test Manually
- Pricing: research needed
- Free plan: research needed
- Affiliate program: research needed
- Alternatives: research needed
- Limitations: research needed

## Comparison Angles
- ${tool.name} vs the closest existing tool
- ${tool.name} vs doing it manually
- ${tool.name} vs a broader AI assistant

## Pros
- Narrow enough to explain clearly
- Has a concrete before/after angle
- May be useful if the workflow is already painful

## Cons / Risks
- Product claims need manual testing
- Pricing and limits are not verified
- Affiliate terms are not verified

## Affiliate CTA Draft
${cta}

## Suggested X Thread
${tool.copyVariants?.threadOpening ?? "Draft a thread after testing the tool manually."}

## FAQ

### Is ${tool.name} free?
Research needed. Do not publish pricing until verified on the official site.

### Does ${tool.name} have an affiliate program?
Research needed. Do not publish or imply commissions without approval.

### What alternatives should be checked?
Research needed. Compare against real alternatives after manual product research.
`;
}

export function buildReviewRecord(tool, filePath, affiliateLink = null) {
  const now = new Date().toISOString();
  return {
    id: createStableId("review", [tool.toolId ?? tool.name, todayString()]),
    toolId: tool.toolId,
    toolName: tool.name,
    toolUrl: tool.url,
    status: "outline_generated",
    filePath,
    affiliateLink: affiliateLink || "",
    createdAt: now,
    updatedAt: now
  };
}

export function reviewFilePath(tool, date = todayString()) {
  return `output/reviews/${date}-${slugify(tool.name)}-review-outline.md`;
}

function cleanSentence(text) {
  return String(text ?? "").replace(/[.。]+$/g, "");
}
