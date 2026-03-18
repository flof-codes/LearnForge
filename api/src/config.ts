import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://learnforge:learnforge@localhost:5432/learnforge",
  port: parseInt(process.env.PORT ?? "3000", 10),
  imagePath: process.env.IMAGE_PATH ?? "/data/images",
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
} as const;
