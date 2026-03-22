import { randomBytes, createHash } from "node:crypto";
import type { Response } from "express";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { verify } from "argon2";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import { db } from "../db/connection.js";
import { users, oauthClients, oauthAuthorizationCodes, oauthTokens } from "@learnforge/core";
import { renderLoginPage } from "./login-page.js";

// Token lifetimes
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;          // 1 hour
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;               // 5 minutes
const PENDING_SESSION_TTL_MS = 10 * 60 * 1000;        // 10 minutes

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

// --- Pending authorization sessions (in-memory, short-lived) ---

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

const pendingSessions = new Map<string, PendingAuth>();

// --- Clients store ---

class LearnForgeClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
    if (!row) return undefined;
    return this.rowToClientInfo(row);
  }

  async registerClient(client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    await db.insert(oauthClients).values({
      clientId: client.client_id,
      clientSecret: client.client_secret ?? null,
      clientSecretExpiresAt: client.client_secret_expires_at ?? null,
      clientIdIssuedAt: client.client_id_issued_at ?? Math.floor(Date.now() / 1000),
      redirectUris: client.redirect_uris,
      tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? null,
      grantTypes: client.grant_types ?? null,
      responseTypes: client.response_types ?? null,
      clientName: client.client_name ?? null,
      clientUri: client.client_uri ?? null,
      scope: client.scope ?? null,
    });
    return client;
  }

  private rowToClientInfo(row: typeof oauthClients.$inferSelect): OAuthClientInformationFull {
    return {
      client_id: row.clientId,
      client_secret: row.clientSecret ?? undefined,
      client_secret_expires_at: row.clientSecretExpiresAt ?? undefined,
      client_id_issued_at: row.clientIdIssuedAt,
      redirect_uris: row.redirectUris,
      token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? undefined,
      grant_types: row.grantTypes ?? undefined,
      response_types: row.responseTypes ?? undefined,
      client_name: row.clientName ?? undefined,
      client_uri: row.clientUri ?? undefined,
      scope: row.scope ?? undefined,
    };
  }
}

// --- OAuth Server Provider ---

export class LearnForgeOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new LearnForgeClientsStore();

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const sessionToken = generateToken();
    pendingSessions.set(sessionToken, {
      client,
      params,
      createdAt: Date.now(),
    });

    const html = renderLoginPage(sessionToken, client.client_name);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const [row] = await db
      .select({ codeChallenge: oauthAuthorizationCodes.codeChallenge })
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code, authorizationCode));

    if (!row) throw new Error("Invalid authorization code");
    return row.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const [codeRow] = await db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code, authorizationCode));

    if (!codeRow) throw new Error("Invalid authorization code");
    if (codeRow.clientId !== client.client_id) throw new Error("Authorization code was not issued to this client");
    if (codeRow.expiresAt < new Date()) throw new Error("Authorization code expired");

    // Delete used code
    await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.code, authorizationCode));

    // Generate tokens
    const accessTokenRaw = generateToken();
    const refreshTokenRaw = generateToken();
    const now = new Date();

    await db.insert(oauthTokens).values([
      {
        token: sha256(accessTokenRaw),
        tokenType: "access",
        clientId: client.client_id,
        userId: codeRow.userId,
        scopes: codeRow.scopes ?? [],
        resource: codeRow.resource,
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      },
      {
        token: sha256(refreshTokenRaw),
        tokenType: "refresh",
        clientId: client.client_id,
        userId: codeRow.userId,
        scopes: codeRow.scopes ?? [],
        resource: codeRow.resource,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    ]);

    return {
      access_token: accessTokenRaw,
      token_type: "bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      scope: (codeRow.scopes ?? []).join(" "),
      refresh_token: refreshTokenRaw,
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const hash = sha256(refreshToken);
    const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.token, hash));

    if (!row) throw new Error("Invalid refresh token");
    if (row.tokenType !== "refresh") throw new Error("Not a refresh token");
    if (row.clientId !== client.client_id) throw new Error("Token was not issued to this client");
    if (row.revokedAt) throw new Error("Token has been revoked");
    if (row.expiresAt < new Date()) throw new Error("Refresh token expired");

    // Revoke old refresh token
    await db.update(oauthTokens).set({ revokedAt: new Date() }).where(eq(oauthTokens.token, hash));

    // Issue new pair
    const accessTokenRaw = generateToken();
    const refreshTokenRaw = generateToken();
    const now = new Date();
    const finalScopes = scopes ?? row.scopes ?? [];

    await db.insert(oauthTokens).values([
      {
        token: sha256(accessTokenRaw),
        tokenType: "access",
        clientId: client.client_id,
        userId: row.userId,
        scopes: finalScopes,
        resource: row.resource,
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      },
      {
        token: sha256(refreshTokenRaw),
        tokenType: "refresh",
        clientId: client.client_id,
        userId: row.userId,
        scopes: finalScopes,
        resource: row.resource,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    ]);

    return {
      access_token: accessTokenRaw,
      token_type: "bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      scope: finalScopes.join(" "),
      refresh_token: refreshTokenRaw,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const hash = sha256(token);
    const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.token, hash));

    if (!row) throw new Error("Invalid access token");
    if (row.tokenType !== "access") throw new Error("Not an access token");
    if (row.revokedAt) throw new Error("Token has been revoked");
    if (row.expiresAt < new Date()) throw new Error("Access token expired");

    return {
      token,
      clientId: row.clientId,
      scopes: row.scopes ?? [],
      expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
      resource: row.resource ? new URL(row.resource) : undefined,
      extra: { userId: row.userId },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const hash = sha256(request.token);
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthTokens.token, hash));
  }
}

// --- Login handler (called from POST /mcp/login) ---

export async function handleLogin(
  body: { session_token?: string; email?: string; password?: string },
): Promise<{ redirect: string } | { html: string }> {
  const { session_token, email, password } = body;

  if (!session_token || !email || !password) {
    return { html: renderLoginPage(session_token ?? "", undefined, "All fields are required") };
  }

  const pending = pendingSessions.get(session_token);
  if (!pending) {
    return { html: renderLoginPage("", undefined, "Session expired. Please try again.") };
  }

  if (Date.now() - pending.createdAt > PENDING_SESSION_TTL_MS) {
    pendingSessions.delete(session_token);
    return { html: renderLoginPage("", undefined, "Session expired. Please try again.") };
  }

  // Verify credentials
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));

  if (!user) {
    return { html: renderLoginPage(session_token, pending.client.client_name, "Invalid email or password") };
  }

  let valid = false;
  try {
    valid = await verify(user.passwordHash, password);
  } catch {
    // Invalid hash format (e.g. migration user with $invalid$)
  }

  if (!valid) {
    return { html: renderLoginPage(session_token, pending.client.client_name, "Invalid email or password") };
  }

  // Clean up pending session
  pendingSessions.delete(session_token);

  // Generate authorization code
  const code = randomBytes(48).toString("base64url");
  await db.insert(oauthAuthorizationCodes).values({
    code,
    clientId: pending.client.client_id,
    userId: user.id,
    redirectUri: pending.params.redirectUri,
    codeChallenge: pending.params.codeChallenge,
    scopes: pending.params.scopes ?? [],
    state: pending.params.state ?? null,
    resource: pending.params.resource?.toString() ?? null,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });

  // Build redirect URL
  const target = new URL(pending.params.redirectUri);
  target.searchParams.set("code", code);
  if (pending.params.state) {
    target.searchParams.set("state", pending.params.state);
  }

  return { redirect: target.toString() };
}

// --- Cleanup (call periodically) ---

export async function cleanupExpiredOAuth(): Promise<void> {
  const now = new Date();
  const gracePeriod = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Delete expired auth codes
  await db.delete(oauthAuthorizationCodes).where(lt(oauthAuthorizationCodes.expiresAt, now));

  // Delete expired+revoked tokens (7-day grace)
  await db.delete(oauthTokens).where(
    and(
      isNotNull(oauthTokens.revokedAt),
      lt(oauthTokens.revokedAt, gracePeriod),
    ),
  );

  // Delete expired tokens past grace period
  await db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, gracePeriod));

  // Clean up stale pending sessions
  for (const [key, session] of pendingSessions) {
    if (Date.now() - session.createdAt > PENDING_SESSION_TTL_MS) {
      pendingSessions.delete(key);
    }
  }
}
