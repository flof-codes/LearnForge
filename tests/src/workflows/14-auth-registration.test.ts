import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();
});

describe("Auth Registration", () => {
  describe("POST /auth/register", () => {
    it("registers with valid email/password/name and returns 201 with token", async () => {
      const email = `reg-success-${Date.now()}@test.dev`;
      const unauth = getUnauthApi();
      const res = await unauth.post("/auth/register", {
        email,
        password: "valid-password-123",
        name: "Test Registration",
      });
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty("token");
      expect(typeof res.data.token).toBe("string");
      expect(res.data.token.length).toBeGreaterThan(0);

      // Token should be a valid JWT (3 dot-separated segments)
      const parts = res.data.token.split(".");
      expect(parts).toHaveLength(3);
    });

    it("can login with newly registered credentials", async () => {
      const email = `reg-login-${Date.now()}@test.dev`;
      const password = "login-test-password";
      const unauth = getUnauthApi();

      await unauth.post("/auth/register", {
        email,
        password,
        name: "Login Test",
      });

      const loginRes = await unauth.post("/auth/login", { email, password });
      expect(loginRes.status).toBe(200);
      expect(loginRes.data).toHaveProperty("token");
      expect(typeof loginRes.data.token).toBe("string");
    });

    it("GET /auth/me shows trial ~30 days from now and isActive true", async () => {
      const email = `reg-trial-${Date.now()}@test.dev`;
      const unauth = getUnauthApi();

      const regRes = await unauth.post("/auth/register", {
        email,
        password: "trial-test-pwd",
        name: "Trial Test",
      });

      // Use the registration token to call /auth/me
      const authed = axios.create({
        baseURL: TEST_CONFIG.apiUrl,
        headers: { Authorization: `Bearer ${regRes.data.token}` },
        validateStatus: () => true,
      });

      const meRes = await authed.get("/auth/me");
      expect(meRes.status).toBe(200);
      expect(meRes.data.isActive).toBe(true);
      expect(meRes.data.hasActiveTrial).toBe(true);

      // trialEndsAt should be roughly 30 days from now (within 5 minutes tolerance)
      const trialEnd = new Date(meRes.data.trialEndsAt).getTime();
      const expected = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const toleranceMs = 5 * 60 * 1000;
      expect(Math.abs(trialEnd - expected)).toBeLessThan(toleranceMs);
    });

    it("rejects duplicate email with 400", async () => {
      const email = `reg-dup-${Date.now()}@test.dev`;
      const unauth = getUnauthApi();

      // Register first time
      const first = await unauth.post("/auth/register", {
        email,
        password: "dup-test-pwd1",
        name: "First User",
      });
      expect(first.status).toBe(201);

      // Register same email again
      const second = await unauth.post("/auth/register", {
        email,
        password: "dup-test-pwd2",
        name: "Second User",
      });
      expect(second.status).toBe(400);
      expect(second.data.error).toMatch(/already exists/i);
    });

    it("rejects short password (< 8 chars) with 400", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post("/auth/register", {
        email: `reg-short-${Date.now()}@test.dev`,
        password: "short",
        name: "Short Pwd",
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/at least 8/i);
    });

    it("rejects missing email with 400", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post("/auth/register", {
        password: "valid-password-123",
        name: "No Email",
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/email/i);
    });

    it("rejects missing password with 400", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post("/auth/register", {
        email: `reg-nopwd-${Date.now()}@test.dev`,
        name: "No Password",
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/password/i);
    });

    it("rejects missing name with 400", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post("/auth/register", {
        email: `reg-noname-${Date.now()}@test.dev`,
        password: "valid-password-123",
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/name/i);
    });

    it("normalizes email (uppercase/whitespace → lowercase/trimmed)", async () => {
      const timestamp = Date.now();
      const rawEmail = `  REG-NORM-${timestamp}@TEST.DEV  `;
      const expectedEmail = `reg-norm-${timestamp}@test.dev`;
      const unauth = getUnauthApi();

      const regRes = await unauth.post("/auth/register", {
        email: rawEmail,
        password: "norm-test-pwd",
        name: "Normalize Test",
      });
      expect(regRes.status).toBe(201);

      // Login with normalized email
      const loginRes = await unauth.post("/auth/login", {
        email: expectedEmail,
        password: "norm-test-pwd",
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.data).toHaveProperty("token");

      // Verify /auth/me shows normalized email
      const authed = axios.create({
        baseURL: TEST_CONFIG.apiUrl,
        headers: { Authorization: `Bearer ${regRes.data.token}` },
        validateStatus: () => true,
      });
      const meRes = await authed.get("/auth/me");
      expect(meRes.data.email).toBe(expectedEmail);
    });
  });

  describe("MCP Key Management", () => {
    let otherApi: AxiosInstance;

    beforeAll(async () => {
      // Use the "other" user which has NO seeded MCP key
      await login(TEST_CONFIG.otherEmail, TEST_CONFIG.otherPassword);
      otherApi = getApi();
    });

    // Restore main test user login after this block
    afterAll(async () => {
      // Clean up: revoke key if one was created
      await login(TEST_CONFIG.otherEmail, TEST_CONFIG.otherPassword);
      const cleanup = getApi();
      await cleanup.delete("/auth/mcp-key");

      // Restore main user
      await login(TEST_CONFIG.email, TEST_CONFIG.password);
    });

    it("status shows no key initially", async () => {
      const res = await otherApi.get("/auth/mcp-key/status");
      expect(res.status).toBe(200);
      expect(res.data.hasKey).toBe(false);
      expect(res.data.createdAt).toBeNull();
    });

    it("generates a new MCP key", async () => {
      const res = await otherApi.post("/auth/mcp-key", {});
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty("key");
      expect(typeof res.data.key).toBe("string");
      // 32 random bytes → 64 hex chars
      expect(res.data.key).toHaveLength(64);
      expect(res.data.key).toMatch(/^[0-9a-f]{64}$/);
    });

    it("status shows key exists after generation", async () => {
      const res = await otherApi.get("/auth/mcp-key/status");
      expect(res.status).toBe(200);
      expect(res.data.hasKey).toBe(true);
      expect(res.data.createdAt).not.toBeNull();
      // createdAt should be a valid date
      expect(new Date(res.data.createdAt).getTime()).not.toBeNaN();
    });

    it("revokes the MCP key", async () => {
      const res = await otherApi.delete("/auth/mcp-key");
      expect(res.status).toBe(204);
    });

    it("status shows no key after revocation", async () => {
      const res = await otherApi.get("/auth/mcp-key/status");
      expect(res.status).toBe(200);
      expect(res.data.hasKey).toBe(false);
      expect(res.data.createdAt).toBeNull();
    });

    describe("Auth Required", () => {
      it("returns 401 for GET /auth/mcp-key/status without token", async () => {
        const unauth = getUnauthApi();
        const res = await unauth.get("/auth/mcp-key/status");
        expect(res.status).toBe(401);
      });

      it("returns 401 for POST /auth/mcp-key without token", async () => {
        const unauth = getUnauthApi();
        const res = await unauth.post("/auth/mcp-key");
        expect(res.status).toBe(401);
      });

      it("returns 401 for DELETE /auth/mcp-key without token", async () => {
        const unauth = getUnauthApi();
        const res = await unauth.delete("/auth/mcp-key");
        expect(res.status).toBe(401);
      });
    });
  });
});
