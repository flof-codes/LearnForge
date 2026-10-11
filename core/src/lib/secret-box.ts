import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts a small secret (an API key) for storage in the database.
 * AES-256-GCM under a key derived from a server-side secret; the stored text
 * is `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */

const VERSION = "v1";

function keyOf(secret: string): Buffer {
  return createHash("sha256").update(`learnforge-secret-box:${secret}`).digest();
}

export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns null when the text was sealed under another secret or was tampered with. */
export function openSecret(sealed: string, secret: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
