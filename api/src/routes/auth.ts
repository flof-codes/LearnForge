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

  app.post<{ Body: { email: string; password: string; name: string } }>(
    "/auth/register",
    async (request, reply) => {
      const { email, password, name } = request.body ?? {};
      if (!email) throw new ValidationError("email is required");
      if (!password) throw new ValidationError("password is required");
      if (password.length < 8) throw new ValidationError("password must be at least 8 characters");
      if (!name) throw new ValidationError("name is required");

      const normalizedEmail = email.toLowerCase().trim();

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail));
      if (existing) throw new ValidationError("An account with this email already exists");

      const passwordHash = await argon2.hash(password);

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);

      const [user] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash,
          name,
          trialEndsAt,
        })
        .returning({ id: users.id });

      const token = app.jwt.sign({ sub: user.id });
      return reply.status(201).send({ token });
    },
  );

  app.get("/auth/me", async (request) => {
    const userId = getUserId(request);
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
        trialEndsAt: users.trialEndsAt,
        subscriptionStatus: users.subscriptionStatus,
        subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedError("User not found");

    const now = new Date();
    const trialActive = user.trialEndsAt > now;
    const subscriptionActive =
      user.subscriptionStatus === "active" &&
      user.subscriptionCurrentPeriodEnd != null &&
      user.subscriptionCurrentPeriodEnd > now;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      trialEndsAt: user.trialEndsAt,
      subscriptionStatus: user.subscriptionStatus,
      hasActiveSubscription: !!subscriptionActive,
      hasActiveTrial: trialActive,
      isActive: trialActive || !!subscriptionActive,
      hasStripeCustomer: !!user.stripeCustomerId,
    };
  });
}
