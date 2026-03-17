import { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { db } from "../db/connection.js";
import { users } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>("/auth/login", async (request) => {
    const { email, password } = request.body ?? {};
    if (!email) throw new ValidationError("email is required");
    if (!password) throw new ValidationError("password is required");

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
    if (!user) throw new UnauthorizedError("Invalid email or password");

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedError("Invalid email or password");

    const token = app.jwt.sign({ sub: user.id });
    return { token };
  });

  app.get("/auth/me", async (request) => {
    const userId = getUserId(request);
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, userId));
    if (!user) throw new UnauthorizedError("User not found");
    return user;
  });
}
