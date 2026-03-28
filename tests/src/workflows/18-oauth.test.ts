import { describe, it, expect, beforeAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import axios from "axios";
import { TEST_CONFIG } from "../helpers/fixtures.js";

const MCP_URL = TEST_CONFIG.mcpUrl;

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ── HTTP client (no auto redirects, no throwing on non-2xx) ───────────────────

const http = axios.create({
  baseURL: MCP_URL,
  maxRedirects: 0,
  validateStatus: () => true,
});

// ── OAuth dance helper ────────────────────────────────────────────────────────

interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Register a dynamic client, walk through authorize → login → token exchange.
 * Returns the tokens and client info for further tests.
 */
async function performOAuthDance(
  email = TEST_CONFIG.email,
  password = TEST_CONFIG.password,
): Promise<{
  tokens: OAuthTokens;
  clientId: string;
  redirectUri: string;
  pkce: { verifier: string; challenge: string };
}> {
  const redirectUri = "http://localhost:9999/callback";
  const pkce = generatePKCE();
  const state = randomBytes(16).toString("hex");

  // 1. Register client
  const regRes = await http.post("/mcp/register", {
    redirect_uris: [redirectUri],
    client_name: `test-${Date.now()}`,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
  expect(regRes.status).toBe(201);
  const clientId = regRes.data.client_id as string;

  // 2. Authorize → login page
  const authRes = await http.get("/mcp/authorize", {
    params: {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
      state,
    },
  });
  expect(authRes.status).toBe(200);

  // Extract session_token from hidden input
  const sessionTokenMatch = (authRes.data as string).match(
    /name="session_token"\s+value="([^"]+)"/,
  );
  expect(sessionTokenMatch).not.toBeNull();
  const sessionToken = sessionTokenMatch![1];

  // 3. Login → redirect with auth code
  const loginRes = await http.post(
    "/mcp/login",
    new URLSearchParams({
      session_token: sessionToken,
      email,
      password,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  expect(loginRes.status).toBe(302);

  const location = loginRes.headers.location as string;
  const callbackUrl = new URL(location);
  const code = callbackUrl.searchParams.get("code")!;
  expect(code).toBeTruthy();
  expect(callbackUrl.searchParams.get("state")).toBe(state);

  // 4. Token exchange
  const tokenRes = await http.post(
    "/mcp/token",
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  expect(tokenRes.status).toBe(200);

  return {
    tokens: tokenRes.data as OAuthTokens,
    clientId,
    redirectUri,
    pkce,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OAuth Flow", () => {
  describe("Discovery", () => {
    it("GET /.well-known/oauth-protected-resource returns valid metadata", async () => {
      const res = await http.get("/.well-known/oauth-protected-resource");
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty("resource");
      expect(res.data).toHaveProperty("authorization_servers");
      expect(res.data.bearer_methods_supported).toContain("header");
    });

    it("GET /.well-known/oauth-authorization-server returns valid metadata", async () => {
      const res = await http.get("/.well-known/oauth-authorization-server");
      expect(res.status).toBe(200);

      const meta = res.data;
      expect(meta).toHaveProperty("issuer");
      expect(meta).toHaveProperty("authorization_endpoint");
      expect(meta).toHaveProperty("token_endpoint");
      expect(meta).toHaveProperty("registration_endpoint");
      expect(meta).toHaveProperty("revocation_endpoint");
      expect(meta.response_types_supported).toContain("code");
      expect(meta.code_challenge_methods_supported).toContain("S256");
      expect(meta.grant_types_supported).toContain("authorization_code");
      expect(meta.grant_types_supported).toContain("refresh_token");
    });

    it("metadata endpoint URLs contain /mcp/ path", async () => {
      const res = await http.get("/.well-known/oauth-authorization-server");
      const meta = res.data;

      // All endpoints should include /mcp/ in the path
      expect(meta.authorization_endpoint).toMatch(/\/mcp\/authorize/);
      expect(meta.token_endpoint).toMatch(/\/mcp\/token/);
      expect(meta.registration_endpoint).toMatch(/\/mcp\/register/);
      expect(meta.revocation_endpoint).toMatch(/\/mcp\/revoke/);
    });
  });

  describe("Client Registration", () => {
    it("POST /mcp/register creates client with client_id", async () => {
      const res = await http.post("/mcp/register", {
        redirect_uris: ["http://localhost:9999/callback"],
        client_name: "Integration Test Client",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      });

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty("client_id");
      expect(res.data.redirect_uris).toEqual(["http://localhost:9999/callback"]);
      expect(res.data.client_name).toBe("Integration Test Client");
    });

    it("POST /mcp/register rejects missing redirect_uris", async () => {
      const res = await http.post("/mcp/register", {
        client_name: "Bad Client",
      });
      // SDK should reject without redirect_uris
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Authorization + Login", () => {
    let clientId: string;
    const redirectUri = "http://localhost:9999/callback";

    beforeAll(async () => {
      const regRes = await http.post("/mcp/register", {
        redirect_uris: [redirectUri],
        client_name: "Auth Test Client",
        token_endpoint_auth_method: "none",
      });
      clientId = regRes.data.client_id;
    });

    it("GET /mcp/authorize returns login page with session token", async () => {
      const pkce = generatePKCE();

      const res = await http.get("/mcp/authorize", {
        params: {
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: pkce.challenge,
          code_challenge_method: "S256",
          state: "test-state",
        },
      });

      expect(res.status).toBe(200);
      const html = res.data as string;
      expect(html).toContain("Sign in");
      expect(html).toContain("session_token");
      expect(html).toContain("Auth Test Client");
    });

    it("POST /mcp/login with valid credentials redirects with auth code", async () => {
      const pkce = generatePKCE();
      const state = "login-test-state";

      // Get login page
      const authRes = await http.get("/mcp/authorize", {
        params: {
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: pkce.challenge,
          code_challenge_method: "S256",
          state,
        },
      });
      const sessionToken = (authRes.data as string).match(
        /name="session_token"\s+value="([^"]+)"/,
      )![1];

      // Submit login
      const loginRes = await http.post(
        "/mcp/login",
        new URLSearchParams({
          session_token: sessionToken,
          email: TEST_CONFIG.email,
          password: TEST_CONFIG.password,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      expect(loginRes.status).toBe(302);
      const location = loginRes.headers.location as string;
      expect(location).toContain(redirectUri);

      const callbackUrl = new URL(location);
      expect(callbackUrl.searchParams.get("code")).toBeTruthy();
      expect(callbackUrl.searchParams.get("state")).toBe(state);
    });

    it("POST /mcp/login with wrong password returns error page", async () => {
      const pkce = generatePKCE();

      const authRes = await http.get("/mcp/authorize", {
        params: {
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: pkce.challenge,
          code_challenge_method: "S256",
        },
      });
      const sessionToken = (authRes.data as string).match(
        /name="session_token"\s+value="([^"]+)"/,
      )![1];

      const loginRes = await http.post(
        "/mcp/login",
        new URLSearchParams({
          session_token: sessionToken,
          email: TEST_CONFIG.email,
          password: "wrong-password",
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      // Returns HTML error page, not a redirect
      expect(loginRes.status).toBe(200);
      expect(loginRes.data as string).toContain("Invalid email or password");
    });

    it("POST /mcp/login with invalid session token returns error", async () => {
      const loginRes = await http.post(
        "/mcp/login",
        new URLSearchParams({
          session_token: "nonexistent-session",
          email: TEST_CONFIG.email,
          password: TEST_CONFIG.password,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      expect(loginRes.status).toBe(200);
      expect(loginRes.data as string).toContain("Session expired");
    });

    it("POST /mcp/login normalizes email (case-insensitive)", async () => {
      const pkce = generatePKCE();

      const authRes = await http.get("/mcp/authorize", {
        params: {
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: pkce.challenge,
          code_challenge_method: "S256",
        },
      });
      const sessionToken = (authRes.data as string).match(
        /name="session_token"\s+value="([^"]+)"/,
      )![1];

      // Login with uppercase email
      const loginRes = await http.post(
        "/mcp/login",
        new URLSearchParams({
          session_token: sessionToken,
          email: "  TEST@LEARNFORGE.DEV  ",
          password: TEST_CONFIG.password,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      expect(loginRes.status).toBe(302);
      expect(loginRes.headers.location).toContain("code=");
    });
  });

  describe("Token Exchange", () => {
    it("exchanges auth code for access + refresh tokens (PKCE)", async () => {
      const { tokens } = await performOAuthDance();

      expect(tokens.access_token).toBeTruthy();
      expect(tokens.refresh_token).toBeTruthy();
      expect(tokens.token_type).toBe("bearer");
      expect(tokens.expires_in).toBeGreaterThan(0);
    });

    it("rejects invalid auth code", async () => {
      // Register a client first
      const regRes = await http.post("/mcp/register", {
        redirect_uris: ["http://localhost:9999/callback"],
        client_name: "Invalid Code Test",
        token_endpoint_auth_method: "none",
      });
      const clientId = regRes.data.client_id;

      const res = await http.post(
        "/mcp/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: "this-is-not-a-real-code",
          client_id: clientId,
          redirect_uri: "http://localhost:9999/callback",
          code_verifier: "doesnt-matter",
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects reused auth code", async () => {
      const redirectUri = "http://localhost:9999/callback";
      const pkce = generatePKCE();
      const state = "reuse-test";

      // Register client
      const regRes = await http.post("/mcp/register", {
        redirect_uris: [redirectUri],
        client_name: "Reuse Code Test",
        token_endpoint_auth_method: "none",
      });
      const clientId = regRes.data.client_id;

      // Authorize
      const authRes = await http.get("/mcp/authorize", {
        params: {
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: pkce.challenge,
          code_challenge_method: "S256",
          state,
        },
      });
      const sessionToken = (authRes.data as string).match(
        /name="session_token"\s+value="([^"]+)"/,
      )![1];

      // Login
      const loginRes = await http.post(
        "/mcp/login",
        new URLSearchParams({
          session_token: sessionToken,
          email: TEST_CONFIG.email,
          password: TEST_CONFIG.password,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      const code = new URL(loginRes.headers.location as string).searchParams.get("code")!;

      // First exchange — should succeed
      const firstRes = await http.post(
        "/mcp/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: pkce.verifier,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      expect(firstRes.status).toBe(200);

      // Second exchange with same code — should fail
      const secondRes = await http.post(
        "/mcp/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: pkce.verifier,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      expect(secondRes.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("OAuth Token Usage", () => {
    it("MCP tool call with OAuth access token succeeds", async () => {
      const { tokens } = await performOAuthDance();

      // Initialize MCP session with OAuth token
      const initRes = await http.post(
        "/mcp",
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "oauth-test", version: "1.0.0" },
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${tokens.access_token}`,
          },
          // SSE comes as text
          responseType: "text",
          transformResponse: [(data: string) => data],
        },
      );
      expect(initRes.status).toBe(200);

      const sessionId = initRes.headers["mcp-session-id"];
      expect(sessionId).toBeTruthy();

      // Call list_topics
      const toolRes = await http.post(
        "/mcp",
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "list_topics", arguments: {} },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${tokens.access_token}`,
            "mcp-session-id": sessionId,
          },
          responseType: "text",
          transformResponse: [(data: string) => data],
        },
      );
      expect(toolRes.status).toBe(200);

      // Parse SSE response
      const lines = (toolRes.data as string).split("\n");
      const dataLine = lines.find((l: string) => l.startsWith("data: "));
      expect(dataLine).toBeTruthy();
      const rpc = JSON.parse(dataLine!.slice(6));
      expect(rpc.result).toBeDefined();
      expect(rpc.error).toBeUndefined();

      // Verify tool returned topics (proves auth worked end-to-end)
      const textContent = rpc.result.content.find((c: { type: string }) => c.type === "text");
      const topics = JSON.parse(textContent.text);
      expect(topics.length).toBeGreaterThan(0);

      // Cleanup: close session
      await http.delete("/mcp", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "mcp-session-id": sessionId,
        },
      });
    });

    it("MCP call with revoked OAuth token fails", async () => {
      const { tokens, clientId } = await performOAuthDance();

      // Revoke the access token
      await http.post(
        "/mcp/revoke",
        new URLSearchParams({
          token: tokens.access_token,
          client_id: clientId,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      // Try to use revoked token
      const res = await http.post(
        "/mcp",
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "revoked-test", version: "1.0.0" },
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${tokens.access_token}`,
          },
        },
      );

      // Should be rejected (401 from dualAuth — not a valid OAuth token, not a valid API key)
      expect(res.status).toBe(401);
    });
  });

  describe("Token Refresh", () => {
    it("exchanges refresh token for new access + refresh tokens", async () => {
      const { tokens, clientId } = await performOAuthDance();

      const refreshRes = await http.post(
        "/mcp/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.data.access_token).toBeTruthy();
      expect(refreshRes.data.refresh_token).toBeTruthy();
      // New tokens should be different from old ones
      expect(refreshRes.data.access_token).not.toBe(tokens.access_token);
      expect(refreshRes.data.refresh_token).not.toBe(tokens.refresh_token);
    });

    it("old refresh token is revoked after use", async () => {
      const { tokens, clientId } = await performOAuthDance();

      // Use refresh token
      const firstRefresh = await http.post(
        "/mcp/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      expect(firstRefresh.status).toBe(200);

      // Try to reuse the same refresh token — should fail
      const secondRefresh = await http.post(
        "/mcp/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      expect(secondRefresh.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Token Revocation", () => {
    it("POST /mcp/revoke revokes access token", async () => {
      const { tokens, clientId } = await performOAuthDance();

      const revokeRes = await http.post(
        "/mcp/revoke",
        new URLSearchParams({
          token: tokens.access_token,
          client_id: clientId,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      // RFC 7009: revocation endpoint returns 200 regardless
      expect(revokeRes.status).toBe(200);
    });

    it("POST /mcp/revoke revokes refresh token", async () => {
      const { tokens, clientId } = await performOAuthDance();

      const revokeRes = await http.post(
        "/mcp/revoke",
        new URLSearchParams({
          token: tokens.refresh_token,
          client_id: clientId,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      expect(revokeRes.status).toBe(200);

      // Revoked refresh token should not work
      const refreshRes = await http.post(
        "/mcp/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      expect(refreshRes.status).toBeGreaterThanOrEqual(400);
    });
  });
});
