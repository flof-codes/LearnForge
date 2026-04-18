import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";

// Direct DB client for setting roles (admin role is only settable via SQL per product spec)
const DB_CONFIG = {
  host: "localhost",
  port: TEST_CONFIG.dbPort,
  user: TEST_CONFIG.dbUser,
  password: TEST_CONFIG.dbPassword,
  database: TEST_CONFIG.dbName,
};

function makeAuthClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: TEST_CONFIG.apiUrl,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
}

async function registerUser(
  email: string,
  password: string,
  name: string,
): Promise<{ id: string; token: string }> {
  const unauth = getUnauthApi();
  const res = await unauth.post("/auth/register", { email, password, name });
  if (res.status !== 201) {
    throw new Error(`Failed to register ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const token = res.data.token as string;
  const authed = makeAuthClient(token);
  const meRes = await authed.get("/auth/me");
  return { id: meRes.data.id, token };
}

describe("Admin Dashboard", () => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const adminEmail = `admin-${runId}@test.dev`;
  const regularEmail = `regular-${runId}@test.dev`;
  const targetEmail = `target-${runId}@test.dev`;
  const password = "admin-test-password";

  let adminId: string;
  let regularId: string;
  let targetId: string;
  let adminApi: AxiosInstance;
  let regularApi: AxiosInstance;
  let pgClient: pg.Client;

  beforeAll(async () => {
    pgClient = new pg.Client(DB_CONFIG);
    await pgClient.connect();

    const admin = await registerUser(adminEmail, password, "Admin User");
    const regular = await registerUser(regularEmail, password, "Regular User");
    const target = await registerUser(targetEmail, password, "Target User");

    adminId = admin.id;
    regularId = regular.id;
    targetId = target.id;

    // Promote the admin account directly in DB (mirrors the one-off SQL bootstrap pattern)
    await pgClient.query(
      `UPDATE users SET role = 'admin', subscription_status = 'free' WHERE id = $1`,
      [adminId],
    );

    adminApi = makeAuthClient(admin.token);
    regularApi = makeAuthClient(regular.token);
  });

  afterAll(async () => {
    // Clean up created users; CASCADE removes topics/cards/etc.
    await pgClient.query(
      `DELETE FROM users WHERE id = ANY($1::uuid[])`,
      [[adminId, regularId, targetId]],
    );
    await pgClient.end();

    // Restore main test user login so subsequent suites aren't affected
    await login(TEST_CONFIG.email, TEST_CONFIG.password);
  });

  describe("Auth Required", () => {
    it("GET /admin/stats without token → 401", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.get("/admin/stats");
      expect(res.status).toBe(401);
    });

    it("GET /admin/users without token → 401", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.get("/admin/users");
      expect(res.status).toBe(401);
    });

    it("POST /admin/users/:id/grant-free without token → 401", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post(`/admin/users/${targetId}/grant-free`);
      expect(res.status).toBe(401);
    });
  });

  describe("Role Enforcement", () => {
    it("non-admin user gets 403 on GET /admin/stats", async () => {
      const res = await regularApi.get("/admin/stats");
      expect(res.status).toBe(403);
    });

    it("non-admin user gets 403 on GET /admin/users", async () => {
      const res = await regularApi.get("/admin/users");
      expect(res.status).toBe(403);
    });

    it("non-admin user gets 403 on POST /admin/users/:id/grant-free", async () => {
      const res = await regularApi.post(`/admin/users/${targetId}/grant-free`, {});
      expect(res.status).toBe(403);
    });

    it("non-admin user gets 403 on POST /admin/users/:id/revoke-free", async () => {
      const res = await regularApi.post(`/admin/users/${targetId}/revoke-free`, {});
      expect(res.status).toBe(403);
    });
  });

  describe("GET /admin/stats", () => {
    it("returns aggregate stats with expected shape", async () => {
      const res = await adminApi.get("/admin/stats");
      expect(res.status).toBe(200);

      expect(typeof res.data.totalUsers).toBe("number");
      expect(res.data.totalUsers).toBeGreaterThanOrEqual(3);

      expect(Array.isArray(res.data.statusBreakdown)).toBe(true);

      expect(res.data.billable).toEqual(
        expect.objectContaining({
          active: expect.any(Number),
          trialing: expect.any(Number),
          pastDue: expect.any(Number),
          freeAdmin: expect.any(Number),
          totalBillable: expect.any(Number),
        }),
      );
      // Our admin is free → should count at least once
      expect(res.data.billable.freeAdmin).toBeGreaterThanOrEqual(1);

      expect(res.data.freeTrial).toEqual(
        expect.objectContaining({
          trialActive: expect.any(Number),
          trialExpired: expect.any(Number),
          totalFree: expect.any(Number),
        }),
      );

      expect(res.data.activity).toEqual(
        expect.objectContaining({
          usersWithCards: expect.any(Number),
          usersWithReviews: expect.any(Number),
        }),
      );
    });
  });

  describe("GET /admin/users", () => {
    it("returns paginated users with expected shape", async () => {
      const res = await adminApi.get("/admin/users", { params: { limit: 200 } });
      expect(res.status).toBe(200);
      expect(typeof res.data.total).toBe("number");
      expect(res.data.limit).toBe(200);
      expect(res.data.offset).toBe(0);
      expect(Array.isArray(res.data.users)).toBe(true);

      const admin = res.data.users.find((u: { id: string }) => u.id === adminId);
      expect(admin).toBeDefined();
      expect(admin.role).toBe("admin");
      expect(admin.subscriptionStatus).toBe("free");
      // password_hash must never be returned
      expect(admin.passwordHash).toBeUndefined();
      // stripe customer id should be hidden; only boolean flag exposed
      expect(admin.stripeCustomerId).toBeUndefined();
      expect(typeof admin.hasStripeCustomer).toBe("boolean");
    });

    it("search filters by email substring", async () => {
      const res = await adminApi.get("/admin/users", {
        params: { search: `target-${runId}` },
      });
      expect(res.status).toBe(200);
      expect(res.data.users.length).toBe(1);
      expect(res.data.users[0].id).toBe(targetId);
    });

    it("search filters by name substring", async () => {
      const res = await adminApi.get("/admin/users", { params: { search: "Target User" } });
      expect(res.status).toBe(200);
      const found = res.data.users.find((u: { id: string }) => u.id === targetId);
      expect(found).toBeDefined();
    });

    it("clamps limit to max 200", async () => {
      const res = await adminApi.get("/admin/users", { params: { limit: 9999 } });
      expect(res.status).toBe(200);
      expect(res.data.limit).toBe(200);
    });

    it("respects pagination offset", async () => {
      const page1 = await adminApi.get("/admin/users", { params: { limit: 1, offset: 0 } });
      const page2 = await adminApi.get("/admin/users", { params: { limit: 1, offset: 1 } });
      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.data.users.length).toBe(1);
      expect(page2.data.users.length).toBe(1);
      expect(page1.data.users[0].id).not.toBe(page2.data.users[0].id);
    });
  });

  describe("POST /admin/users/:id/grant-free", () => {
    it("grants free status to a regular user", async () => {
      const res = await adminApi.post(`/admin/users/${targetId}/grant-free`, {});
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const { rows } = await pgClient.query(
        `SELECT subscription_status, subscription_current_period_end FROM users WHERE id = $1`,
        [targetId],
      );
      expect(rows[0].subscription_status).toBe("free");
      expect(rows[0].subscription_current_period_end).toBeNull();
    });

    it("granted-free user can still create content (bypasses trial/subscription gate)", async () => {
      // Artificially expire the target's trial so only the 'free' status keeps them active
      await pgClient.query(
        `UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
        [targetId],
      );

      // Log in fresh as the target user to pick up updated state
      const login = await getUnauthApi().post("/auth/login", {
        email: targetEmail,
        password,
      });
      expect(login.status).toBe(200);
      const targetApi = makeAuthClient(login.data.token);

      // Creating a topic is a non-GET content-modifying route, which goes through the subscription gate
      const createRes = await targetApi.post("/topics", {
        name: `Admin Free Test ${runId}`,
      });
      expect(createRes.status).toBe(201);

      // Clean up the topic
      await targetApi.delete(`/topics/${createRes.data.id}`);
    });

    it("returns 400 when user already has free status", async () => {
      const res = await adminApi.post(`/admin/users/${targetId}/grant-free`, {});
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/already/i);
    });

    it("returns 404 for non-existent user", async () => {
      const fakeId = "00000000-0000-0000-0000-0000000000aa";
      const res = await adminApi.post(`/admin/users/${fakeId}/grant-free`, {});
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid UUID in path", async () => {
      const res = await adminApi.post(`/admin/users/not-a-uuid/grant-free`, {});
      expect(res.status).toBe(400);
    });
  });

  describe("POST /admin/users/:id/revoke-free", () => {
    it("revokes free status and grants fresh 30-day trial", async () => {
      const res = await adminApi.post(`/admin/users/${targetId}/revoke-free`, {});
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const { rows } = await pgClient.query(
        `SELECT subscription_status, trial_ends_at FROM users WHERE id = $1`,
        [targetId],
      );
      expect(rows[0].subscription_status).toBeNull();

      const trialEnd = new Date(rows[0].trial_ends_at).getTime();
      const expected = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const toleranceMs = 5 * 60 * 1000;
      expect(Math.abs(trialEnd - expected)).toBeLessThan(toleranceMs);
    });

    it("returns 400 when user is not on free status", async () => {
      const res = await adminApi.post(`/admin/users/${targetId}/revoke-free`, {});
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/does not have/i);
    });

    it("cannot revoke free status from an admin", async () => {
      const res = await adminApi.post(`/admin/users/${adminId}/revoke-free`, {});
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/admin/i);

      // Verify admin still has free status
      const { rows } = await pgClient.query(
        `SELECT role, subscription_status FROM users WHERE id = $1`,
        [adminId],
      );
      expect(rows[0].role).toBe("admin");
      expect(rows[0].subscription_status).toBe("free");
    });
  });

  describe("/auth/me reflects role and isFree", () => {
    it("admin /auth/me returns role=admin and isFree=true", async () => {
      const res = await adminApi.get("/auth/me");
      expect(res.status).toBe(200);
      expect(res.data.role).toBe("admin");
      expect(res.data.isFree).toBe(true);
      expect(res.data.isActive).toBe(true);
    });

    it("regular user /auth/me returns role=user and isFree=false", async () => {
      const res = await regularApi.get("/auth/me");
      expect(res.status).toBe(200);
      expect(res.data.role).toBe("user");
      expect(res.data.isFree).toBe(false);
    });
  });

  describe("Billing interaction with free status", () => {
    it("POST /billing/checkout is blocked for free users", async () => {
      // Re-grant free to admin target for this test is not needed — admin is already free
      const res = await adminApi.post("/billing/checkout", { plan: "monthly" });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/free/i);
    });
  });
});
