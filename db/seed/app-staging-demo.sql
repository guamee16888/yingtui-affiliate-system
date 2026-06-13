-- AI Creator OS app.guamee.org staging seed.
-- Safe demo data only: no real X handles, no posted URLs, no tokens, no affiliate links.

INSERT OR REPLACE INTO workspaces (
  workspace_id, name, plan, account_limit, publish_mode, auto_publish_enabled,
  requires_final_approval, status, created_at, updated_at
) VALUES (
  'workspace_staging_demo', 'Staging Demo Workspace', 'staging', 30, 'manual', 0,
  1, 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
);

INSERT OR REPLACE INTO users (
  user_id, email, name, role, status, created_at, updated_at
) VALUES
  ('user_staging_manager', 'Zh697631@gmail.com', 'Staging Manager', 'manager', 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('user_staging_staff_a', 'staff-a@example.invalid', 'Staff A', 'staff', 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('user_staging_staff_b', 'staff-b@example.invalid', 'Staff B', 'staff', 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO workspace_members (
  workspace_member_id, workspace_id, user_id, role, status, created_at, updated_at
) VALUES
  ('wm_staging_manager', 'workspace_staging_demo', 'user_staging_manager', 'manager', 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('wm_staging_staff_a', 'workspace_staging_demo', 'user_staging_staff_a', 'staff', 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('wm_staging_staff_b', 'workspace_staging_demo', 'user_staging_staff_b', 'staff', 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO content_lanes (
  lane_id, name, description, risk_policy, active, created_at, updated_at
) VALUES
  ('ai_startups', 'AI Startups', 'AI startup tools and workflows.', 'conservative', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('indie_builders', 'Indie Builders', 'Independent developer products and build notes.', 'conservative', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('saas_founders', 'SaaS Founders', 'Founder operations and SaaS growth tools.', 'conservative', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('crypto_builders', 'Crypto Builders', 'Builder-side crypto infrastructure, no trading advice.', 'strict', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO workspace_lanes (
  workspace_lane_id, workspace_id, lane_id, enabled, priority, monthly_quota, created_at, updated_at
) VALUES
  ('wl_staging_ai', 'workspace_staging_demo', 'ai_startups', 1, 1, 120, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('wl_staging_indie', 'workspace_staging_demo', 'indie_builders', 1, 2, 90, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('wl_staging_saas', 'workspace_staging_demo', 'saas_founders', 1, 3, 90, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('wl_staging_crypto', 'workspace_staging_demo', 'crypto_builders', 1, 4, 60, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO x_accounts (
  account_id, workspace_id, handle, persona, niche, status, daily_post_limit,
  external_link_limit, manager_user_id, owner_user_id, created_at, updated_at
) VALUES
  ('acct_staging_ai_ops', 'workspace_staging_demo', 'demo_ai_ops', 'AI ops curator', 'AI startup operators', 'active', 10, 1, 'user_staging_manager', 'user_staging_staff_a', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('acct_staging_indie', 'workspace_staging_demo', 'demo_indie_builds', 'Indie build notes', 'indie developers', 'active', 10, 1, 'user_staging_manager', 'user_staging_staff_a', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('acct_staging_saas', 'workspace_staging_demo', 'demo_saas_ops', 'SaaS operator desk', 'SaaS founders', 'active', 10, 1, 'user_staging_manager', 'user_staging_staff_b', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('acct_staging_crypto', 'workspace_staging_demo', 'demo_crypto_build', 'Crypto builder notes', 'crypto builders', 'active', 8, 0, 'user_staging_manager', 'user_staging_staff_b', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO assignments (
  assignment_id, workspace_id, user_id, account_id, active, start_date, end_date, created_at, updated_at
) VALUES
  ('assign_staging_ai_ops', 'workspace_staging_demo', 'user_staging_staff_a', 'acct_staging_ai_ops', 1, '2026-06-13', NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('assign_staging_indie', 'workspace_staging_demo', 'user_staging_staff_a', 'acct_staging_indie', 1, '2026-06-13', NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('assign_staging_saas', 'workspace_staging_demo', 'user_staging_staff_b', 'acct_staging_saas', 1, '2026-06-13', NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('assign_staging_crypto', 'workspace_staging_demo', 'user_staging_staff_b', 'acct_staging_crypto', 1, '2026-06-13', NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO tools (
  tool_id, canonical_name, url, domain, tagline, created_at, updated_at
) VALUES
  ('tool_staging_research', 'Demo Research Desk', 'https://example.invalid/research-desk', 'example.invalid', 'Collects niche product signals for review.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('tool_staging_support', 'Demo Support Radar', 'https://example.invalid/support-radar', 'example.invalid', 'Finds recurring support pain points.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('tool_staging_billing', 'Demo Billing Notes', 'https://example.invalid/billing-notes', 'example.invalid', 'Summarizes trial and billing friction.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO topics (
  topic_id, workspace_id, tool_id, lane_id, angle, status, score, created_at, updated_at
) VALUES
  ('topic_staging_ai_1', 'workspace_staging_demo', 'tool_staging_research', 'ai_startups', 'AI teams need fewer dashboards and better review queues.', 'ready', 82, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('topic_staging_indie_1', 'workspace_staging_demo', 'tool_staging_research', 'indie_builders', 'Indie founders can validate niches before building landing pages.', 'ready', 78, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('topic_staging_saas_1', 'workspace_staging_demo', 'tool_staging_support', 'saas_founders', 'Support tickets reveal better content angles than feature lists.', 'ready', 80, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('topic_staging_crypto_1', 'workspace_staging_demo', 'tool_staging_billing', 'crypto_builders', 'Builder tools need clearer trust signals before users connect wallets.', 'ready', 74, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO copy_library (
  copy_id, workspace_id, topic_id, tool_id, variant_type, copy_text,
  normalized_text_hash, weighted_char_count, status, created_at, updated_at
) VALUES
  ('copy_staging_ai_1', 'workspace_staging_demo', 'topic_staging_ai_1', 'tool_staging_research', 'shortPost', 'A lot of AI ops tools still feel like another inbox. The useful ones turn messy product signals into a short review queue your team can actually finish.', 'hash_staging_ai_1', 150, 'ready', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('copy_staging_ai_2', 'workspace_staging_demo', 'topic_staging_ai_1', 'tool_staging_research', 'painPointHook', 'The hard part is not finding AI tools. It is deciding which tiny tools deserve a thread, a review page, or a quiet skip.', 'hash_staging_ai_2', 126, 'ready', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('copy_staging_indie_1', 'workspace_staging_demo', 'topic_staging_indie_1', 'tool_staging_research', 'casualPost', 'Small founder lesson: before writing a giant review page, see if a plain post gets replies from the exact niche first.', 'hash_staging_indie_1', 113, 'ready', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('copy_staging_saas_1', 'workspace_staging_demo', 'topic_staging_saas_1', 'tool_staging_support', 'contrarianAngle', 'Your best SaaS content ideas may already be hiding in support tickets. Product pages tell you what you sell; tickets tell you what people actually struggle with.', 'hash_staging_saas_1', 157, 'ready', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('copy_staging_crypto_1', 'workspace_staging_demo', 'topic_staging_crypto_1', 'tool_staging_billing', 'shortPost', 'For crypto builder tools, trust copy matters more than hype copy. Show the permission, the failure mode, and the rollback path before the big promise.', 'hash_staging_crypto_1', 145, 'ready', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO post_tasks (
  task_id, workspace_id, account_id, assigned_to, manager_user_id, tool_id, topic_id,
  copy_id, copy_text, status, approval_status, weighted_char_count,
  duplicate_check_json, risk_flags_json, notes, created_at, updated_at
) VALUES
  ('task_staging_ai_1', 'workspace_staging_demo', 'acct_staging_ai_ops', 'user_staging_staff_a', 'user_staging_manager', 'tool_staging_research', 'topic_staging_ai_1', 'copy_staging_ai_1', 'A lot of AI ops tools still feel like another inbox. The useful ones turn messy product signals into a short review queue your team can actually finish.', 'pending_review', 'pending', 150, '{"riskLevel":"low","flags":[]}', '[]', 'Staging demo task.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('task_staging_ai_2', 'workspace_staging_demo', 'acct_staging_ai_ops', 'user_staging_staff_a', 'user_staging_manager', 'tool_staging_research', 'topic_staging_ai_1', 'copy_staging_ai_2', 'The hard part is not finding AI tools. It is deciding which tiny tools deserve a thread, a review page, or a quiet skip.', 'feedback_due', 'approved', 126, '{"riskLevel":"low","flags":[]}', '[]', 'Use this task to test feedback save.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('task_staging_indie_1', 'workspace_staging_demo', 'acct_staging_indie', 'user_staging_staff_a', 'user_staging_manager', 'tool_staging_research', 'topic_staging_indie_1', 'copy_staging_indie_1', 'Small founder lesson: before writing a giant review page, see if a plain post gets replies from the exact niche first.', 'pending_review', 'pending', 113, '{"riskLevel":"low","flags":[]}', '[]', 'Staging demo task.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('task_staging_saas_1', 'workspace_staging_demo', 'acct_staging_saas', 'user_staging_staff_b', 'user_staging_manager', 'tool_staging_support', 'topic_staging_saas_1', 'copy_staging_saas_1', 'Your best SaaS content ideas may already be hiding in support tickets. Product pages tell you what you sell; tickets tell you what people actually struggle with.', 'approved', 'approved', 157, '{"riskLevel":"low","flags":[]}', '[]', 'Staging demo task.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('task_staging_crypto_1', 'workspace_staging_demo', 'acct_staging_crypto', 'user_staging_staff_b', 'user_staging_manager', 'tool_staging_billing', 'topic_staging_crypto_1', 'copy_staging_crypto_1', 'For crypto builder tools, trust copy matters more than hype copy. Show the permission, the failure mode, and the rollback path before the big promise.', 'pending_review', 'pending', 145, '{"riskLevel":"low","flags":[]}', '[]', 'No trading claims.', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR REPLACE INTO publish_settings (
  publish_settings_id, workspace_id, global_auto_publish_enabled, dry_run_by_default,
  require_approval_before_publish, settings_json, created_at, updated_at
) VALUES (
  'publish_settings_staging_demo', 'workspace_staging_demo', 0, 1, 1,
  '{"livePublishEnabled":false,"manualReviewRequired":true}',
  '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
);
