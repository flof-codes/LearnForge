import "dotenv/config";
import { createHmac } from "node:crypto";
import path from "node:path";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://learnforge:learnforge@localhost:5432/learnforge",
  port: parseInt(process.env.PORT ?? "3000", 10),
  imagePath: process.env.IMAGE_PATH ?? "/data/images",
  /**
   * Staged Anki uploads until their import ends. Defaults to a folder on the
   * image volume, so an upload survives a recreated container between preview
   * and commit. Files there are never served: media are looked up by id.
   */
  importPath: process.env.IMPORT_PATH ?? path.join(process.env.IMAGE_PATH ?? "/data/images", ".imports"),
  /** Media storage per user; an import stops storing files past it. */
  mediaQuotaBytes: parseInt(process.env.MEDIA_QUOTA_MB ?? "5120", 10) * 1024 * 1024,
  /**
   * Optional origin for the signed `/media/…` links in card HTML. Empty (the
   * default) keeps them relative; the web app resolves them against the API
   * address it already uses. Set it only for a client that cannot do that.
   */
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceIdMonthly: process.env.STRIPE_PRICE_ID_MONTHLY ?? "",
  stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_ANNUAL ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  /** Browser origins allowed to call the API: the web app, plus CORS_ORIGINS (comma separated). */
  corsOrigins: [
    process.env.APP_URL ?? "http://localhost:5173",
    ...(process.env.CORS_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean),
  ],
  mcpPort: parseInt(process.env.MCP_PORT ?? "3001", 10),
  mcpPublicUrl: process.env.MCP_PUBLIC_URL ?? "http://localhost:3001/mcp",
  // SMTP_HOST is the on/off switch for outgoing mail: unset means the mailer
  // logs instead of sending, so dev and CI run without a mail server.
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "LearnForge <office@learnforge.eu>",
} as const;

/** Signs media URLs; derived from the JWT secret, so rotating that secret also revokes every issued media URL. */
export const mediaUrlSecret = createHmac("sha256", config.jwtSecret).update("learnforge-media-url").digest("hex");
