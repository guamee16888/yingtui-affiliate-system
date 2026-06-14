-- AI Creator OS local D1 schema.
-- Local-only MVP for app.guamee.org data foundations.

CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'internal',
  account_limit INTEGER NOT NULL DEFAULT 30,
  publish_mode TEXT NOT NULL DEFAULT 'manual',
  auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
  requires_final_approval INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_member_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS x_accounts (
  account_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  handle TEXT,
  persona TEXT,
  niche TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  daily_post_limit INTEGER NOT NULL DEFAULT 10,
  external_link_limit INTEGER NOT NULL DEFAULT 1,
  manager_user_id TEXT REFERENCES users(user_id),
  owner_user_id TEXT REFERENCES users(user_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  assignment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  account_id TEXT NOT NULL REFERENCES x_accounts(account_id),
  active INTEGER NOT NULL DEFAULT 1,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_lanes (
  lane_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  risk_policy TEXT NOT NULL DEFAULT 'conservative',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_lanes (
  workspace_lane_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  lane_id TEXT NOT NULL REFERENCES content_lanes(lane_id),
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 1,
  monthly_quota INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, lane_id)
);

CREATE TABLE IF NOT EXISTS source_connectors (
  connector_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused',
  secret_ref TEXT,
  quality_tier TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_feeds (
  feed_id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES source_connectors(connector_id),
  lane_id TEXT REFERENCES content_lanes(lane_id),
  name TEXT NOT NULL,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  quality_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_candidates (
  raw_candidate_id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(workspace_id),
  lane_id TEXT REFERENCES content_lanes(lane_id),
  connector_id TEXT REFERENCES source_connectors(connector_id),
  feed_id TEXT REFERENCES source_feeds(feed_id),
  title TEXT NOT NULL,
  url TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  source_published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tools (
  tool_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  url TEXT,
  domain TEXT,
  tagline TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  topic_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  tool_id TEXT REFERENCES tools(tool_id),
  lane_id TEXT REFERENCES content_lanes(lane_id),
  angle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS copy_library (
  copy_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  topic_id TEXT REFERENCES topics(topic_id),
  tool_id TEXT REFERENCES tools(tool_id),
  variant_type TEXT NOT NULL,
  copy_text TEXT NOT NULL,
  normalized_text_hash TEXT NOT NULL,
  weighted_char_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_tasks (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  account_id TEXT REFERENCES x_accounts(account_id),
  assigned_to TEXT REFERENCES users(user_id),
  manager_user_id TEXT REFERENCES users(user_id),
  tool_id TEXT REFERENCES tools(tool_id),
  topic_id TEXT REFERENCES topics(topic_id),
  copy_id TEXT REFERENCES copy_library(copy_id),
  copy_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  weighted_char_count INTEGER NOT NULL DEFAULT 0,
  duplicate_check_json TEXT NOT NULL DEFAULT '{}',
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_ledger (
  ledger_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  task_id TEXT NOT NULL REFERENCES post_tasks(task_id),
  account_id TEXT NOT NULL REFERENCES x_accounts(account_id),
  employee_id TEXT REFERENCES users(user_id),
  tool_id TEXT REFERENCES tools(tool_id),
  copy_id TEXT REFERENCES copy_library(copy_id),
  normalized_text_hash TEXT,
  posted_text TEXT NOT NULL,
  posted_url TEXT,
  posted_at TEXT,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, task_id)
);

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  task_id TEXT REFERENCES post_tasks(task_id),
  ledger_id TEXT REFERENCES post_ledger(ledger_id),
  account_id TEXT REFERENCES x_accounts(account_id),
  tool_id TEXT REFERENCES tools(tool_id),
  copy_id TEXT REFERENCES copy_library(copy_id),
  metrics_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_settings (
  publish_settings_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  global_auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
  dry_run_by_default INTEGER NOT NULL DEFAULT 1,
  require_approval_before_publish INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS x_connections (
  connection_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  account_id TEXT NOT NULL REFERENCES x_accounts(account_id),
  x_user_id TEXT,
  handle TEXT,
  token_ref TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected',
  scopes_json TEXT NOT NULL DEFAULT '[]',
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_jobs (
  job_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  task_id TEXT NOT NULL REFERENCES post_tasks(task_id),
  account_id TEXT NOT NULL REFERENCES x_accounts(account_id),
  status TEXT NOT NULL DEFAULT 'draft',
  dry_run INTEGER NOT NULL DEFAULT 1,
  scheduled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_attempts (
  attempt_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  job_id TEXT NOT NULL REFERENCES publish_jobs(job_id),
  account_id TEXT NOT NULL REFERENCES x_accounts(account_id),
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(workspace_id),
  actor_user_id TEXT,
  actor_role TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_events (
  api_event_id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(workspace_id),
  actor_user_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  plan TEXT NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'active',
  require_discord_verification INTEGER NOT NULL DEFAULT 1,
  required_discord_guild_id TEXT,
  required_discord_role_ids_json TEXT NOT NULL DEFAULT '[]',
  max_accounts INTEGER NOT NULL DEFAULT 30,
  max_seats INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id)
);

CREATE TABLE IF NOT EXISTS user_identities (
  identity_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  username TEXT,
  guild_id TEXT,
  role_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'verified',
  verified_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, provider),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS license_events (
  license_event_id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(workspace_id),
  user_id TEXT REFERENCES users(user_id),
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_x_accounts_workspace ON x_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_x_accounts_status ON x_accounts(status);
CREATE INDEX IF NOT EXISTS idx_assignments_workspace ON assignments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_account ON assignments(account_id);
CREATE INDEX IF NOT EXISTS idx_workspace_lanes_workspace ON workspace_lanes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_source_feeds_lane ON source_feeds(lane_id);
CREATE INDEX IF NOT EXISTS idx_raw_candidates_workspace ON raw_candidates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_raw_candidates_status ON raw_candidates(status);
CREATE INDEX IF NOT EXISTS idx_raw_candidates_created_at ON raw_candidates(created_at);
CREATE INDEX IF NOT EXISTS idx_tools_domain ON tools(domain);
CREATE INDEX IF NOT EXISTS idx_topics_workspace ON topics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_topics_tool ON topics(tool_id);
CREATE INDEX IF NOT EXISTS idx_copy_library_workspace ON copy_library(workspace_id);
CREATE INDEX IF NOT EXISTS idx_copy_library_topic ON copy_library(topic_id);
CREATE INDEX IF NOT EXISTS idx_copy_library_hash ON copy_library(normalized_text_hash);
CREATE INDEX IF NOT EXISTS idx_post_tasks_workspace ON post_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_tasks_status ON post_tasks(status);
CREATE INDEX IF NOT EXISTS idx_post_tasks_account ON post_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_post_tasks_assigned_to ON post_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_post_tasks_created_at ON post_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_post_ledger_workspace ON post_ledger(workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_ledger_task ON post_ledger(task_id);
CREATE INDEX IF NOT EXISTS idx_post_ledger_account ON post_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_post_ledger_posted_at ON post_ledger(posted_at);
CREATE INDEX IF NOT EXISTS idx_feedback_workspace ON feedback(workspace_id);
CREATE INDEX IF NOT EXISTS idx_feedback_task ON feedback(task_id);
CREATE INDEX IF NOT EXISTS idx_feedback_account ON feedback(account_id);
CREATE INDEX IF NOT EXISTS idx_publish_settings_workspace ON publish_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_x_connections_workspace ON x_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_x_connections_account ON x_connections(account_id);
CREATE INDEX IF NOT EXISTS idx_x_connections_status ON x_connections(status);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_workspace ON publish_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_task ON publish_jobs(task_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_status ON publish_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publish_attempts_workspace ON publish_attempts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_publish_attempts_job ON publish_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_events_workspace ON api_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_events_created_at ON api_events(created_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_provider_user ON user_identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_license_events_workspace ON license_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_license_events_created_at ON license_events(created_at);
