-- Migration: OAuth 2.0 tables for MCP server
-- Supports Dynamic Client Registration, authorization codes (PKCE), and token management

-- 1. OAuth clients (registered via DCR)
CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "client_id"                  varchar(255) PRIMARY KEY,
  "client_secret"              text,
  "client_secret_expires_at"   bigint,
  "client_id_issued_at"        bigint NOT NULL,
  "redirect_uris"              text[] NOT NULL,
  "token_endpoint_auth_method" varchar(50),
  "grant_types"                text[],
  "response_types"             text[],
  "client_name"                varchar(255),
  "client_uri"                 text,
  "scope"                      text,
  "created_at"                 timestamptz DEFAULT now() NOT NULL
);

-- 2. Authorization codes (short-lived, PKCE)
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "code"            varchar(128) PRIMARY KEY,
  "client_id"       varchar(255) NOT NULL REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redirect_uri"    text NOT NULL,
  "code_challenge"  text NOT NULL,
  "scopes"          text[] DEFAULT '{}',
  "state"           text,
  "resource"        text,
  "expires_at"      timestamptz NOT NULL,
  "created_at"      timestamptz DEFAULT now() NOT NULL
);

-- 3. Access and refresh tokens (SHA-256 hashed)
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "token"       varchar(255) PRIMARY KEY,
  "token_type"  varchar(20) NOT NULL,
  "client_id"   varchar(255) NOT NULL REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scopes"      text[] DEFAULT '{}',
  "resource"    text,
  "expires_at"  timestamptz NOT NULL,
  "revoked_at"  timestamptz,
  "created_at"  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauth_tokens_user_idx" ON "oauth_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_tokens_expires_idx" ON "oauth_tokens" ("expires_at");
