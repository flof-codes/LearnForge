import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://learnforge:learnforge@localhost:5432/learnforge",
  port: parseInt(process.env.PORT ?? "3000", 10),
  imagePath: process.env.IMAGE_PATH ?? "/data/images",
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
} as const;
