import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Card HTML stores media as `/images/<id>`. That route needs a login token,
 * which an `<img>` inside the sandboxed card frame never sends, so responses
 * carry signed URLs instead: `<base>/media/<id>/<sig>`. The signature is an
 * HMAC of the id and its owner under a server secret; the API signs only ids
 * the requesting user owns, so referencing someone else's image id in your
 * own card yields no usable URL. Requests that write HTML get the reverse
 * rewrite, so a signed URL never ends up in the database.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SIG_LENGTH = 22;

export function mediaSignature(id: string, ownerId: string, secret: string): string {
  return createHmac("sha256", secret).update(`media:${id.toLowerCase()}:${ownerId.toLowerCase()}`).digest("base64url").slice(0, SIG_LENGTH);
}

export function verifyMediaSignature(id: string, ownerId: string, sig: string, secret: string): boolean {
  const expected = Buffer.from(mediaSignature(id, ownerId, secret));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * `/images/<id>` references in attribute or CSS-url position. Matches raw
 * HTML and JSON-serialized payloads, where quotes appear as `\"`.
 */
const STORED_REF = new RegExp(`(?<=(?:src|href|data|poster)=\\\\?["']?|url\\(\\\\?["']?)/images/(${UUID})`, "gi");

/** Ids referenced in media position, for the ownership lookup before signing. */
export function referencedMediaIds(text: string): string[] {
  if (!text.includes("/images/")) return [];
  return [...new Set([...text.matchAll(STORED_REF)].map(m => m[1].toLowerCase()))];
}

/** Rewrites references to ids in `owned` into signed absolute URLs for `ownerId`; others stay as they are. */
export function signMediaRefs(text: string, baseUrl: string, secret: string, ownerId: string, owned: Set<string>): string {
  if (owned.size === 0) return text;
  const base = baseUrl.replace(/\/+$/, "");
  return text.replace(STORED_REF, (whole, id: string) =>
    owned.has(id.toLowerCase()) ? `${base}/media/${id}/${mediaSignature(id, ownerId, secret)}` : whole);
}

const SIGNED_REF = new RegExp(`(?:https?://[^\\s"'()<>]*?)?/media/(${UUID})/([A-Za-z0-9_-]{${SIG_LENGTH}})`, "gi");

/** Signed URLs valid for `ownerId` go back to `/images/<id>`; anything else is left alone. */
export function unsignMediaRefs(text: string, secret: string, ownerId: string): string {
  if (!text.includes("/media/")) return text;
  return text.replace(SIGNED_REF, (whole, id: string, sig: string) =>
    verifyMediaSignature(id, ownerId, sig, secret) ? `/images/${id}` : whole);
}

/** Applies `unsignMediaRefs` to every string in a parsed JSON body. */
export function unsignMediaRefsDeep<T>(value: T, secret: string, ownerId: string): T {
  if (typeof value === "string") return unsignMediaRefs(value, secret, ownerId) as T;
  if (Array.isArray(value)) return value.map(v => unsignMediaRefsDeep(v, secret, ownerId)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = unsignMediaRefsDeep(v, secret, ownerId);
    return out as T;
  }
  return value;
}
