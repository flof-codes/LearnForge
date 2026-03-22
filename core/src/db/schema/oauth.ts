import { pgTable, varchar, text, bigint, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const oauthClients = pgTable("oauth_clients", {
  clientId: varchar("client_id", { length: 255 }).primaryKey(),
  clientSecret: text("client_secret"),
  clientSecretExpiresAt: bigint("client_secret_expires_at", { mode: "number" }),
  clientIdIssuedAt: bigint("client_id_issued_at", { mode: "number" }).notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  tokenEndpointAuthMethod: varchar("token_endpoint_auth_method", { length: 50 }),
  grantTypes: text("grant_types").array(),
  responseTypes: text("response_types").array(),
  clientName: varchar("client_name", { length: 255 }),
  clientUri: text("client_uri"),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  code: varchar("code", { length: 128 }).primaryKey(),
  clientId: varchar("client_id", { length: 255 }).notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scopes: text("scopes").array().default([]),
  state: text("state"),
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthTokens = pgTable("oauth_tokens", {
  token: varchar("token", { length: 255 }).primaryKey(),
  tokenType: varchar("token_type", { length: 20 }).notNull(),
  clientId: varchar("client_id", { length: 255 }).notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scopes: text("scopes").array().default([]),
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("oauth_tokens_user_idx").on(table.userId),
  index("oauth_tokens_expires_idx").on(table.expiresAt),
]);
