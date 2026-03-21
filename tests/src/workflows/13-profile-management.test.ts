import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";

/**
 * Profile management tests.
 *
 * Tests updating user name, email, and password via API endpoints.
 * Restores original values in afterAll to avoid breaking other test suites.
 */

let api: AxiosInstance;

beforeAll(async () => {
  await login(TEST_CONFIG.email, TEST_CONFIG.password);
  api = getApi();
});

afterAll(async () => {
  // Restore original email and name in case they were changed
  // First login with the current credentials (might be changed)
  try {
    await login(TEST_CONFIG.email, TEST_CONFIG.password);
  } catch {
    // If original email login fails, try the changed email
    try {
      await login("newemail@test.dev", TEST_CONFIG.password);
      const restoreApi = getApi();
      await restoreApi.put("/auth/profile", {
        email: TEST_CONFIG.email,
        current_password: TEST_CONFIG.password,
      });
    } catch {
      // try with changed password
      try {
        await login(TEST_CONFIG.email, "NewPassword123");
        const restoreApi = getApi();
        await restoreApi.put("/auth/password", {
          current_password: "NewPassword123",
          new_password: TEST_CONFIG.password,
        });
      } catch {
        // Last resort - login with changed email AND password
        try {
          await login("newemail@test.dev", "NewPassword123");
          const restoreApi = getApi();
          await restoreApi.put("/auth/profile", {
            email: TEST_CONFIG.email,
            current_password: "NewPassword123",
          });
          await restoreApi.put("/auth/password", {
            current_password: "NewPassword123",
            new_password: TEST_CONFIG.password,
          });
        } catch {
          // If all else fails, tests will fail on next run anyway
        }
      }
    }
  }

  // Re-login with original credentials and restore name
  await login(TEST_CONFIG.email, TEST_CONFIG.password);
  const restoreApi = getApi();
  await restoreApi.put("/auth/profile", { name: "Test User" });
});

describe("Profile Management", () => {
  describe("Update Name", () => {
    it("updates name successfully", async () => {
      const res = await api.put("/auth/profile", { name: "Updated Name" });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe("Updated Name");

      // Verify via GET /auth/me
      const me = await api.get("/auth/me");
      expect(me.data.name).toBe("Updated Name");
    });

    it("trims whitespace from name", async () => {
      const res = await api.put("/auth/profile", { name: "  Trimmed Name  " });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe("Trimmed Name");
    });

    it("rejects empty name", async () => {
      const res = await api.put("/auth/profile", { name: "" });
      expect(res.status).toBe(400);
    });

    it("rejects whitespace-only name", async () => {
      const res = await api.put("/auth/profile", { name: "   " });
      expect(res.status).toBe(400);
    });

    it("rejects request with no fields", async () => {
      const res = await api.put("/auth/profile", {});
      expect(res.status).toBe(400);
    });

    // Restore name for subsequent tests
    afterAll(async () => {
      await api.put("/auth/profile", { name: "Test User" });
    });
  });

  describe("Update Email", () => {
    it("updates email with correct password", async () => {
      const res = await api.put("/auth/profile", {
        email: "newemail@test.dev",
        current_password: TEST_CONFIG.password,
      });
      expect(res.status).toBe(200);
      expect(res.data.email).toBe("newemail@test.dev");
    });

    it("can login with new email", async () => {
      const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
      const loginRes = await import("axios").then((ax) =>
        ax.default.post(`${url}/auth/login`, {
          email: "newemail@test.dev",
          password: TEST_CONFIG.password,
        }),
      );
      expect(loginRes.status).toBe(200);
      expect(loginRes.data.token).toBeTruthy();
    });

    it("normalizes email to lowercase", async () => {
      // First restore original email
      await login("newemail@test.dev", TEST_CONFIG.password);
      const restoreApi = getApi();
      await restoreApi.put("/auth/profile", {
        email: TEST_CONFIG.email,
        current_password: TEST_CONFIG.password,
      });
      await login(TEST_CONFIG.email, TEST_CONFIG.password);
      api = getApi();

      const res = await api.put("/auth/profile", {
        email: "UPPER@TEST.DEV",
        current_password: TEST_CONFIG.password,
      });
      expect(res.status).toBe(200);
      expect(res.data.email).toBe("upper@test.dev");

      // Restore
      await login("upper@test.dev", TEST_CONFIG.password);
      const api2 = getApi();
      await api2.put("/auth/profile", {
        email: TEST_CONFIG.email,
        current_password: TEST_CONFIG.password,
      });
      await login(TEST_CONFIG.email, TEST_CONFIG.password);
      api = getApi();
    });

    it("rejects email change without password", async () => {
      const res = await api.put("/auth/profile", {
        email: "new@test.dev",
      });
      expect(res.status).toBe(400);
    });

    it("rejects email change with wrong password", async () => {
      const res = await api.put("/auth/profile", {
        email: "new@test.dev",
        current_password: "wrong-password",
      });
      expect(res.status).toBe(401);
    });

    it("rejects duplicate email", async () => {
      const res = await api.put("/auth/profile", {
        email: TEST_CONFIG.otherEmail,
        current_password: TEST_CONFIG.password,
      });
      expect(res.status).toBe(400);
    });

    // Restore after email tests
    afterAll(async () => {
      try {
        await login(TEST_CONFIG.email, TEST_CONFIG.password);
        api = getApi();
      } catch {
        // email might have been changed, restore it
      }
    });
  });

  describe("Update Name and Email Together", () => {
    it("updates both fields in one request", async () => {
      const res = await api.put("/auth/profile", {
        name: "Both Changed",
        email: "both@test.dev",
        current_password: TEST_CONFIG.password,
      });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe("Both Changed");
      expect(res.data.email).toBe("both@test.dev");

      // Restore
      await login("both@test.dev", TEST_CONFIG.password);
      const api2 = getApi();
      await api2.put("/auth/profile", {
        name: "Test User",
        email: TEST_CONFIG.email,
        current_password: TEST_CONFIG.password,
      });
      await login(TEST_CONFIG.email, TEST_CONFIG.password);
      api = getApi();
    });
  });

  describe("Change Password", () => {
    describe("validation", () => {
      it("rejects without current password", async () => {
        const res = await api.put("/auth/password", {
          new_password: "NewPassword123",
        });
        expect(res.status).toBe(400);
      });

      it("rejects with wrong current password", async () => {
        const res = await api.put("/auth/password", {
          current_password: "wrong-password",
          new_password: "NewPassword123",
        });
        expect(res.status).toBe(401);
      });

      it("rejects short new password", async () => {
        const res = await api.put("/auth/password", {
          current_password: TEST_CONFIG.password,
          new_password: "short",
        });
        expect(res.status).toBe(400);
      });

      it("rejects missing new password", async () => {
        const res = await api.put("/auth/password", {
          current_password: TEST_CONFIG.password,
        });
        expect(res.status).toBe(400);
      });
    });

    describe("successful change", () => {
      afterAll(async () => {
        // Restore password
        await login(TEST_CONFIG.email, "NewPassword123");
        const api2 = getApi();
        await api2.put("/auth/password", {
          current_password: "NewPassword123",
          new_password: TEST_CONFIG.password,
        });
        await login(TEST_CONFIG.email, TEST_CONFIG.password);
        api = getApi();
      });

      it("changes password successfully", async () => {
        const res = await api.put("/auth/password", {
          current_password: TEST_CONFIG.password,
          new_password: "NewPassword123",
        });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      });

      it("can login with new password", async () => {
        const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
        const loginRes = await import("axios").then((ax) =>
          ax.default.post(`${url}/auth/login`, {
            email: TEST_CONFIG.email,
            password: "NewPassword123",
          }),
        );
        expect(loginRes.status).toBe(200);
        expect(loginRes.data.token).toBeTruthy();
      });

      it("cannot login with old password", async () => {
        const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
        const loginRes = await import("axios").then((ax) =>
          ax.default
            .create({ validateStatus: () => true })
            .post(`${url}/auth/login`, {
              email: TEST_CONFIG.email,
              password: TEST_CONFIG.password,
            }),
        );
        expect(loginRes.status).toBe(401);
      });
    });
  });

  describe("Auth Required", () => {
    it("returns 401 for unauthenticated PUT /auth/profile", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.put("/auth/profile", { name: "Hacker" });
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated PUT /auth/password", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.put("/auth/password", {
        current_password: "foo",
        new_password: "bar12345",
      });
      expect(res.status).toBe(401);
    });
  });
});
