import type { Question, Summary } from "./state.js";

/**
 * The LearnForge API as the glasses see it.
 *
 * Every call goes to one whitelisted origin (glasses/app.json) with the glasses
 * bearer token. The token is a secret the device generated itself; the server
 * only ever saw its hash.
 */

/** The api is served under /api on the production host; app.json whitelists the origin. */
export const API_BASE: string = (import.meta.env?.VITE_API_URL as string | undefined) ?? "https://learnforge.eu/api";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

const REQUEST_TIMEOUT_MS = 25000;
/** Questions per fetch: the whole batch with options and explanations travels in one response. */
export const BATCH_SIZE = 10;

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  // A request that never returns would leave the display on "Preparing" forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal });
  } catch (err) {
    throw new ApiError(0, controller.signal.aborted ? "No answer from the server in 25 s" : (err instanceof Error ? err.message : String(err)));
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body.code);
  return body as T;
}

/**
 * SHA-256 of a string. `crypto.subtle` exists only on secure pages, and the
 * QR-sideloaded dev build is served over plain http, so a small pure-JS
 * implementation stands in when it is missing.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return hex(new Uint8Array(digest));
  }
  return hex(sha256Bytes(bytes));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** FIPS 180-4 SHA-256, used only when SubtleCrypto is unavailable. */
function sha256Bytes(message: Uint8Array): Uint8Array {
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const bitLen = message.length * 8;
  const padded = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  h.forEach((v, i) => ov.setUint32(i * 4, v));
  return out;
}

export function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function startPairing(tokenHash: string) {
  return request<{ code: string; expiresAt: string }>("/glasses/pair/start", { method: "POST", body: JSON.stringify({ token_hash: tokenHash }) });
}

export function pollPairing(code: string) {
  return request<{ status: "pending" | "claimed" }>("/glasses/pair/poll", { method: "POST", body: JSON.stringify({ code }) });
}

interface SummaryResponse {
  dueCount: number;
  newCount: number;
  streak: number;
  accuracy7d: number | null;
  bloomLevels: Record<number, number>;
}

export async function fetchSummary(token: string): Promise<Summary> {
  const s = await request<SummaryResponse>("/glasses/summary", { token });
  return { dueCount: s.dueCount, newCount: s.newCount, reviewStreak: s.streak, accuracy7d: s.accuracy7d, bloomLevels: s.bloomLevels };
}

interface BatchResponse {
  sessionId: string;
  questions: Question[];
  pendingCompile: number;
  compiling: boolean;
}

export function fetchBatch(token: string, mode: "single" | "multi", sessionId: string | null, exclude: string[]): Promise<BatchResponse> {
  const params = new URLSearchParams({ mode, limit: String(BATCH_SIZE) });
  if (sessionId) params.set("session_id", sessionId);
  if (exclude.length) params.set("exclude", exclude.slice(0, 50).join(","));
  return request<BatchResponse>(`/glasses/next?${params.toString()}`, { token });
}

export interface ReviewBody {
  question_id: string;
  selected: string[];
  dont_know?: boolean;
  multi?: boolean;
}

export function submitReview(token: string, body: ReviewBody) {
  return request<unknown>("/glasses/reviews", { method: "POST", token, body: JSON.stringify(body) });
}
