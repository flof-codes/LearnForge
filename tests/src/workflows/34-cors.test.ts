import { describe, it, expect } from "vitest";
import axios from "axios";
import { TEST_CONFIG } from "../helpers/fixtures.js";

/**
 * Browsers may call the API from the web app only. The test compose sets
 * APP_URL to the API's own address, which stands in for the web app here.
 */
const apiUrl = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
const http = axios.create({ baseURL: apiUrl, validateStatus: () => true });
const preflight = (path: string, origin: string) =>
  http.options(path, { headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization" } });

describe("CORS", () => {
  it("allows the web app's origin", async () => {
    const res = await preflight("/cards", "http://localhost:4444");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:4444");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("refuses other origins for app routes", async () => {
    const res = await preflight("/cards", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    const plain = await http.get("/health", { headers: { Origin: "https://evil.example" } });
    expect(plain.status).toBe(200); // /health is open to any origin
    expect(plain.headers["access-control-allow-origin"]).toBe("https://evil.example");
  });

  it("lets the glasses app, which has no web origin, reach its routes", async () => {
    const res = await preflight("/glasses/pair/start", "null");
    expect(res.headers["access-control-allow-origin"]).toBe("null");
  });
});
