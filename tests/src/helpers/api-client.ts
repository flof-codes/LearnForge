import axios, { type AxiosInstance } from "axios";
import { TEST_CONFIG } from "./fixtures.js";

let token: string | null = null;
let apiInstance: AxiosInstance | null = null;

/**
 * Authenticate with the test API and store the JWT token.
 */
export async function login(email?: string, password?: string): Promise<string> {
  const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
  const res = await axios.post(`${url}/auth/login`, {
    email: email ?? TEST_CONFIG.email,
    password: password ?? TEST_CONFIG.password,
  });
  token = res.data.token as string;
  apiInstance = null; // force re-creation with new token
  return token!
}

/**
 * Get a pre-configured axios instance with JWT authorization.
 * Call login() first or the requests will be unauthenticated.
 */
export function getApi(): AxiosInstance {
  if (apiInstance) return apiInstance;

  const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
  apiInstance = axios.create({
    baseURL: url,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true, // don't throw on non-2xx — let tests assert status
  });

  return apiInstance;
}

/**
 * Get an unauthenticated axios instance (for testing 401s).
 */
export function getUnauthApi(): AxiosInstance {
  const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
  return axios.create({
    baseURL: url,
    validateStatus: () => true,
  });
}

/**
 * Get the current JWT token (or null if not logged in).
 */
export function getToken(): string | null {
  return token;
}
