import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getUnauthApi } from "./api-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Reads the webhook secret straight out of tests/.env.test — the same file
 * Docker Compose loads into the test-api container — so the test always signs
 * with the value the API verifies against, independent of env-var load order.
 *
 * Returns "" when the file or key is absent; callers skip in that case.
 */
export function readWebhookSecret(): string {
  const path = resolve(__dirname, "../../.env.test");
  if (!existsSync(path)) return "";
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("STRIPE_WEBHOOK_SECRET=")) {
      return trimmed.slice("STRIPE_WEBHOOK_SECRET=".length);
    }
  }
  return "";
}

export function signWebhook(secret: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export async function postWebhook(
  secret: string,
  eventType: string,
  eventObject: Record<string, unknown>,
  eventId?: string,
) {
  const payload = JSON.stringify({
    id: eventId ?? `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: eventType,
    created: Math.floor(Date.now() / 1000),
    data: { object: eventObject },
  });
  return getUnauthApi().post("/billing/webhook", payload, {
    headers: {
      "stripe-signature": signWebhook(secret, payload),
      "Content-Type": "application/json",
    },
  });
}
