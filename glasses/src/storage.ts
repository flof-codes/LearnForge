import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { ReviewBody } from "./api.js";

/**
 * Persistent state on the phone, through the SDK's storage. Browser storage in
 * the Even Realities WebView does not survive app or glasses restarts.
 */

const KEY_TOKEN = "learnforge.token";
const KEY_SESSION = "learnforge.session";
const KEY_QUEUE = "learnforge.reviewQueue";

async function read(bridge: EvenAppBridge, key: string): Promise<string | null> {
  try {
    const v = await bridge.getLocalStorage(key);
    return v ? v : null;
  } catch {
    return null;
  }
}

async function write(bridge: EvenAppBridge, key: string, value: string): Promise<void> {
  try { await bridge.setLocalStorage(key, value); } catch { /* storage is best effort */ }
}

export const storage = {
  getToken: (b: EvenAppBridge) => read(b, KEY_TOKEN),
  setToken: (b: EvenAppBridge, token: string) => write(b, KEY_TOKEN, token),
  clearToken: (b: EvenAppBridge) => write(b, KEY_TOKEN, ""),

  getSession: (b: EvenAppBridge) => read(b, KEY_SESSION),
  setSession: (b: EvenAppBridge, id: string) => write(b, KEY_SESSION, id),

  async getQueue(b: EvenAppBridge): Promise<ReviewBody[]> {
    const raw = await read(b, KEY_QUEUE);
    if (!raw) return [];
    try { return JSON.parse(raw) as ReviewBody[]; } catch { return []; }
  },
  setQueue: (b: EvenAppBridge, queue: ReviewBody[]) => write(b, KEY_QUEUE, JSON.stringify(queue)),
};
