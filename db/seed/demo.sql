-- Sanitized local D1 demo seed. No real tokens, secrets, or posted URLs.

INSERT OR IGNORE INTO workspaces (
  workspace_id, name, plan, account_limit, publish_mode, auto_publish_enabled,
  requires_final_approval, status, created_at, updated_at
) VALUES (
  'workspace_default', 'Default Workspace', 'internal', 30, 'manual', 0,
  1, 'active', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
);

INSERT OR IGNORE INTO users (
  user_id, email, name, role, status, created_at, updated_at
) VALUES (
  'user_owner', '', 'Owner', 'admin', 'active',
  '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
);

INSERT OR IGNORE INTO workspace_members (
  workspace_member_id, workspace_id, user_id, role, status, created_at, updated_at
) VALUES (
  'wm_default_owner', 'workspace_default', 'user_owner', 'admin', 'active',
  '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
);

INSERT OR IGNORE INTO content_lanes (
  lane_id, name, description, risk_policy, active, created_at, updated_at
) VALUES
  ('ai_startups', 'AI Startup', 'AI tools, agents, workflows, and founder signals.', 'conservative', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('indie_builders', 'Indie Builders', 'Solo founder launches and builder workflow notes.', 'conservative', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('saas_founders', 'SaaS Founders', 'Pricing, onboarding, churn, PLG, and founder ops.', 'conservative', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'),
  ('crypto_builders', 'Crypto Builders', 'Builder-focused crypto infrastructure and tooling.', 'strict', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');

INSERT OR IGNORE INTO x_accounts (
  account_id, workspace_id, handle, persona, niche, status, daily_post_limit,
  external_link_limit, manager_user_id, owner_user_id, created_at, updated_at
) VALUES (
  'ai_tools_lab', 'workspace_default', '', 'AI Tools Lab', 'AI tools discovery',
  'active', 10, 1, 'user_owner', 'user_owner',
  '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
);

INSERT OR IGNORE INTO publish_settings (
  publish_settings_id, workspace_id, global_auto_publish_enabled, dry_run_by_default,
  require_approval_before_publish, settings_json, created_at, updated_at
) VALUES (
  'publish_settings_workspace_default', 'workspace_default', 0, 1, 1, '{}',
  '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
);
