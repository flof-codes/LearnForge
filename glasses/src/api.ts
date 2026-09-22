import type { Question, Summary } from "./state.js";

/**
 * The LearnForge API as the glasses see it.
 *
 * Every call goes to one whitelisted origin (glasses/app.json) with the glasses
 * bearer token. The token is a secret the device generated itself; the server
 * only ever saw its hash.
 */

export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://learnforge.eu";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body.code);
  return body as T;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
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
  const params = new URLSearchParams({ mode, limit: "5" });
  if (sessionId) params.set("session_id", sessionId);
  if (exclude.length) params.set("exclude", exclude.slice(0, 50).join(","));
  return request<BatchResponse>(`/glasses/next?${params.toString()}`, { token });
}

export interface ReviewBody {
  question_id: string;
  selected: string[];
  dont_know?: boolean;
}

export function submitReview(token: string, body: ReviewBody) {
  return request<unknown>("/glasses/reviews", { method: "POST", token, body: JSON.stringify(body) });
}
