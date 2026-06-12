export function formatTodayPlanMarkdown(plan) {
  return `# 今日 Affiliate 选题计划 - ${plan.date}

## 今天先发这 3 条

${plan.posts.length ? plan.posts.map((item, index) => `${index + 1}. ${item.toolName} - ${item.copyText}`).join("\n\n") : "暂无明确发推候选。"}

## 今天查这 1 个 Affiliate

${plan.affiliate ? `- ${plan.affiliate.toolName}
- Search query: ${plan.affiliate.searchQuery}
- Reason: ${plan.affiliate.reason}` : "暂无明确 Affiliate 研究候选。"}

## 今天保留这 1 个长文候选

${plan.longform ? `- ${plan.longform.toolName}
- Why: ${plan.longform.reason}` : "暂无明确长文候选。"}

## 注意事项

- 不要编造价格、佣金、收益或用户评价。
- 没有真实 affiliate link 前，只放 Product Hunt 或官网链接。
- 先看 X 互动，再决定是否写 SEO 测评页。
`;
}

export function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 10000) / 100}%`;
}

export function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
