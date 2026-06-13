-- AI Creator OS D1 schema draft.
-- This is a contract only. The current project still uses local JSON.

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
  weighted_char_count INTEGER NOT NULL,
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
  weighted_char_count INTEGER NOT NULL,
  duplicate_check_json TEXT NOT NULL DEFAULT '{}',
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
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
  updated_at TEXT NOT NULL
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
  scopes TEXT NOT NULL DEFAULT '',
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
  workspace_id TEXT,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_events (
  api_event_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor_user_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
