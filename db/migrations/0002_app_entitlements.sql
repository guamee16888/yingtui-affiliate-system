-- Workspace entitlements and Discord verification.

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

CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_provider_user ON user_identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_license_events_workspace ON license_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_license_events_created_at ON license_events(created_at);
