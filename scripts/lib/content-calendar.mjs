export function buildContentCalendar({ date, draftPlan = null, accountStrategy = null, startHour = 9, endHour = 23 }) {
  const accountById = new Map((accountStrategy?.accounts ?? []).map((account) => [account.id, account]));
  const accountPlans = draftPlan?.accountPlans ?? [];
  const calendarAccounts = accountPlans.map((plan) => buildAccountCalendar({
    date,
    plan,
    account: accountById.get(plan.accountId),
    startHour,
    endHour
  }));
  const targetPosts = calendarAccounts.reduce((sum, account) => sum + account.targetPosts, 0);
  const scheduledPosts = calendarAccounts.reduce((sum, account) => sum + account.scheduledPosts, 0);
  const availableDrafts = calendarAccounts.reduce((sum, account) => sum + account.availableDrafts, 0);
  const sameDayCapacity = calendarAccounts.reduce((sum, account) => sum + account.sameDayCapacity, 0);
  const draftGap = calendarAccounts.reduce((sum, account) => sum + account.draftGap, 0);
  const capacityGap = calendarAccounts.reduce((sum, account) => sum + account.capacityGap, 0);
  const summary = {
    accounts: calendarAccounts.length,
    targetPosts,
    availableDrafts,
    sameDayCapacity,
    scheduledPosts,
    draftGap,
    capacityGap,
    unscheduledDrafts: calendarAccounts.reduce((sum, account) => sum + account.unscheduledDrafts.length, 0),
    readyAccounts: calendarAccounts.filter((account) => account.status === "ready").length,
    targetIncompatibleAccounts: calendarAccounts.filter((account) => account.status === "target_incompatible").length
  };

  return {
    date,
    mode: "manual_review_calendar",
    window: {
      startHour,
      endHour,
      timezone: "local"
    },
    rule: "Schedule drafts into review slots. Every slot still requires manual approval before publishing.",
    summary,
    scalePlan: buildScalePlan(calendarAccounts, summary),
    accountCalendars: calendarAccounts,
    warnings: buildCalendarWarnings(calendarAccounts, targetPosts, scheduledPosts, capacityGap, draftGap)
  };
}

export function renderContentCalendarMarkdown(calendar) {
  if (!calendar) return "# Content Calendar\n\nNo content calendar available. Run npm run daily first.\n";

  return `# Account Content Calendar - ${calendar.date}

- Mode: ${calendar.mode}
- Rule: ${calendar.rule}
- Window: ${formatHour(calendar.window.startHour)}-${formatHour(calendar.window.endHour)} local
- Target posts: ${calendar.summary.targetPosts}
- Available drafts: ${calendar.summary.availableDrafts}
- Same-day capacity: ${calendar.summary.sameDayCapacity}
- Scheduled posts: ${calendar.summary.scheduledPosts}
- Draft gap: ${calendar.summary.draftGap}
- Capacity gap: ${calendar.summary.capacityGap}
- Ready accounts: ${calendar.summary.readyAccounts}/${calendar.summary.accounts}

${renderScalePlan(calendar.scalePlan)}

${calendar.warnings.length ? `Warnings:\n${calendar.warnings.map((warning) => `- ${warning}`).join("\n")}\n\n` : ""}${calendar.accountCalendars.map(renderAccountCalendar).join("\n\n")}
`;
}

function buildScalePlan(accounts, summary) {
  const accountCount = Math.max(1, Number(summary.accounts ?? accounts.length ?? 0));
  const targetPerAccount = Math.round(Number(summary.targetPosts ?? 0) / accountCount);
  const maxPerAccountUnderCurrentCooldown = Math.floor(Number(summary.sameDayCapacity ?? 0) / accountCount);
  const theoreticalMaxTodayPosts = Math.min(
    Number(summary.targetPosts ?? 0),
    Number(summary.availableDrafts ?? 0),
    Number(summary.sameDayCapacity ?? 0)
  );
  const recommendedCooldownHoursForTarget = maxNumber(accounts.map((account) => account.recommendedCooldownHours));
  const blockers = [
    Number(summary.draftGap ?? 0) > 0 ? "draft_supply" : "",
    Number(summary.capacityGap ?? 0) > 0 ? "cooldown_capacity" : ""
  ].filter(Boolean);

  return {
    status: blockers.length ? "not_ready_to_scale" : "ready_to_scale",
    targetPerAccount,
    currentScheduledPosts: Number(summary.scheduledPosts ?? 0),
    theoreticalMaxTodayPosts,
    recommendedTargetPerAccountIfKeepCooldown: maxPerAccountUnderCurrentCooldown,
    recommendedCooldownHoursForTarget,
    blockers,
    headline: scaleHeadline({ blockers, theoreticalMaxTodayPosts, targetPosts: Number(summary.targetPosts ?? 0) }),
    nextActions: scaleNextActions({ blockers, summary, maxPerAccountUnderCurrentCooldown, recommendedCooldownHoursForTarget })
  };
}

function renderScalePlan(scalePlan) {
  if (!scalePlan) return "";
  return `## Scale Reality

- Status: ${scalePlan.status}
- Headline: ${scalePlan.headline}
- Current scheduled posts: ${scalePlan.currentScheduledPosts}
- Theoretical max today: ${scalePlan.theoreticalMaxTodayPosts}
- Recommended target if keeping current cooldowns: ${scalePlan.recommendedTargetPerAccountIfKeepCooldown}/account/day
- Cooldown needed for current target: about ${scalePlan.recommendedCooldownHoursForTarget}h
- Blockers: ${scalePlan.blockers.length ? scalePlan.blockers.join(", ") : "none"}

Next actions:
${scalePlan.nextActions.map((action, index) => `${index + 1}. ${action}`).join("\n")}`;
}

function scaleHeadline({ blockers, theoreticalMaxTodayPosts, targetPosts }) {
  if (!blockers.length) return "Current target fits the available drafts and review slots.";
  return `Do not aim for ${targetPosts}/day yet. Review about ${theoreticalMaxTodayPosts} posts today unless you add more qualified drafts and change cooldowns.`;
}

function scaleNextActions({ blockers, summary, maxPerAccountUnderCurrentCooldown, recommendedCooldownHoursForTarget }) {
  const actions = [];
  if (blockers.includes("draft_supply")) actions.push(`Add ${summary.draftGap} more qualified, non-duplicate drafts before trying to fill the current target.`);
  if (blockers.includes("cooldown_capacity")) actions.push(`Keep current cooldowns and lower the target to about ${maxPerAccountUnderCurrentCooldown}/account/day, or reduce cooldown to about ${recommendedCooldownHoursForTarget}h for the current target.`);
  actions.push(`Only manually review the ${summary.scheduledPosts} scheduled posts until feedback data exists.`);
  return actions;
}

function buildAccountCalendar({ date, plan, account, startHour, endHour }) {
  const targetPosts = Number(account?.dailyPostLimit ?? plan.targetPosts ?? 0);
  const cooldownHours = Math.max(1, Number(account?.cooldownHours ?? 6));
  const possibleTimes = buildSlotTimes({ date, startHour, endHour, cooldownHours }).slice(0, targetPosts);
  const drafts = plan.drafts ?? [];
  const scheduledDrafts = drafts.slice(0, possibleTimes.length);
  const slots = scheduledDrafts.map((draft, index) => ({
    slot: index + 1,
    scheduledLocalTime: possibleTimes[index],
    status: "needs_manual_review",
    toolId: draft.toolId,
    toolName: draft.toolName,
    url: draft.url,
    variantType: draft.variantType,
    copyText: draft.copyText,
    score: draft.score,
    reason: draft.reason
  }));
  const sameDayCapacity = possibleTimes.length;
  const scheduledPosts = slots.length;
  const draftGap = Math.max(0, targetPosts - drafts.length);
  const capacityGap = Math.max(0, targetPosts - sameDayCapacity);
  const recommendedCooldownHours = recommendedCooldown({ startHour, endHour, targetPosts });

  return {
    accountId: plan.accountId,
    displayName: plan.displayName,
    category: plan.category,
    targetPosts,
    cooldownHours,
    recommendedCooldownHours,
    sameDayCapacity,
    availableDrafts: drafts.length,
    scheduledPosts,
    draftGap,
    capacityGap,
    status: accountStatus({ targetPosts, scheduledPosts, draftGap, capacityGap }),
    slots,
    unscheduledDrafts: drafts.slice(slots.length).map((draft) => ({
      toolId: draft.toolId,
      toolName: draft.toolName,
      variantType: draft.variantType,
      reason: capacityGap > 0 ? "No same-day slot under current cooldown." : "Not scheduled."
    })),
    notes: accountNotes({ targetPosts, cooldownHours, recommendedCooldownHours, draftGap, capacityGap })
  };
}

function buildSlotTimes({ date, startHour, endHour, cooldownHours }) {
  const times = [];
  for (let hour = startHour; hour <= endHour; hour += cooldownHours) {
    times.push(`${date} ${formatHour(hour)}`);
  }
  return times;
}

function recommendedCooldown({ startHour, endHour, targetPosts }) {
  if (targetPosts <= 1) return 0;
  const windowHours = Math.max(0, endHour - startHour);
  return Math.floor((windowHours / (targetPosts - 1)) * 10) / 10;
}

function maxNumber(values) {
  const numbers = values.map((value) => Number(value)).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : 0;
}

function accountStatus({ targetPosts, scheduledPosts, draftGap, capacityGap }) {
  if (scheduledPosts >= targetPosts) return "ready";
  if (capacityGap > 0) return "target_incompatible";
  if (draftGap > 0) return "draft_short";
  return "needs_review";
}

function accountNotes({ targetPosts, cooldownHours, recommendedCooldownHours, draftGap, capacityGap }) {
  const notes = [];
  if (capacityGap > 0) {
    notes.push(`Target ${targetPosts}/day does not fit cooldown ${cooldownHours}h. Use about ${recommendedCooldownHours}h or lower daily target.`);
  }
  if (draftGap > 0) notes.push(`Need ${draftGap} more unique drafts for this account.`);
  if (!notes.length) notes.push("Enough drafts and same-day slots. Review manually before publishing.");
  return notes;
}

function buildCalendarWarnings(accounts, targetPosts, scheduledPosts, capacityGap, draftGap) {
  const warnings = [];
  if (capacityGap > 0) warnings.push(`Current cooldown settings make ${capacityGap} target slots impossible inside one day.`);
  if (draftGap > 0) warnings.push(`Draft supply is short by ${draftGap} posts before manual review.`);
  if (scheduledPosts < targetPosts) warnings.push(`Calendar scheduled ${scheduledPosts}/${targetPosts} target posts.`);
  return warnings;
}

function renderAccountCalendar(account) {
  return `## ${account.displayName}

- Status: ${account.status}
- Scheduled: ${account.scheduledPosts}/${account.targetPosts}
- Cooldown: ${account.cooldownHours}h (recommended for target: ${account.recommendedCooldownHours}h)
- Same-day capacity: ${account.sameDayCapacity}
- Draft gap: ${account.draftGap}
- Capacity gap: ${account.capacityGap}
- Notes: ${account.notes.join(" ")}

${account.slots.length ? account.slots.map((slot) => `${slot.slot}. ${slot.scheduledLocalTime} — ${slot.toolName} — ${slot.variantType}
   ${slot.copyText}`).join("\n") : "No slots scheduled."}`;
}

function formatHour(value) {
  const hour = Math.floor(Number(value));
  const minute = Math.round((Number(value) - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
