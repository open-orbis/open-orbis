-- MCP OAuth 2.1 authorization server tables.
-- All tables are additive; no existing data is touched.

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id                  UUID PRIMARY KEY,
  client_secret_hash         TEXT,
  client_name                TEXT NOT NULL,
  redirect_uris              TEXT[] NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  registered_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_from_ip         INET,
  registered_user_agent      TEXT,
  disabled_at                TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_registered_at
  ON oauth_clients(registered_at DESC);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code                  TEXT PRIMARY KEY,
  client_id             UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id               TEXT NOT NULL,
  share_token_id        TEXT,
  scope                 TEXT NOT NULL DEFAULT 'orbis.read',
  redirect_uri          TEXT NOT NULL,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  consumed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires
  ON oauth_authorization_codes(expires_at);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash      TEXT PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id         TEXT NOT NULL,
  share_token_id  TEXT,
  scope           TEXT NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_access_user
  ON oauth_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_expires
  ON oauth_access_tokens(expires_at);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash      TEXT PRIMARY KEY,
  client_id       UUID NOT NULL REFERENCES oauth_clients(client_id),
  user_id         TEXT NOT NULL,
  share_token_id  TEXT,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  rotated_to      TEXT
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user
  ON oauth_refresh_tokens(user_id);
