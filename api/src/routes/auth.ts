import { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../db/connection.js";
import { users, images, checkSubscriptionAccess, extFromMime } from "@learnforge/core";
import { and, eq, ne } from "drizzle-orm";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";
import { config } from "../config.js";
import { deleteStripeCustomer, updateStripeCustomer } from "../services/stripe.js";

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

  async function getUserProfile(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        trialEndsAt: users.trialEndsAt,
        subscriptionStatus: users.subscriptionStatus,
        subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedError("User not found");

    const access = checkSubscriptionAccess(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      trialEndsAt: user.trialEndsAt,
      subscriptionStatus: user.subscriptionStatus,
      hasActiveSubscription: access.hasActiveSubscription,
      hasActiveTrial: access.hasActiveTrial,
      isFree: access.isFree,
      isActive: access.isActive,
      hasStripeCustomer: !!user.stripeCustomerId,
    };
  }

  app.get("/auth/me", async (request) => {
    const userId = getUserId(request);
    return getUserProfile(userId);
  });

  app.put<{ Body: { name?: string; email?: string; current_password?: string } }>(
    "/auth/profile",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            current_password: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const userId = getUserId(request);
      const { name, email, current_password } = request.body ?? {};

      if (!name && !email) throw new ValidationError("name or email is required");

      const [currentUser] = await db
        .select({
          passwordHash: users.passwordHash,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, userId));
      if (!currentUser) throw new UnauthorizedError("User not found");

      const updateFields: Record<string, string> = {};

      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) throw new ValidationError("name cannot be empty");
        updateFields.name = trimmedName;
      }

      if (email !== undefined) {
        if (!current_password) throw new ValidationError("current_password is required to change email");

        const valid = await argon2.verify(currentUser.passwordHash, current_password);
        if (!valid) throw new UnauthorizedError("Invalid password");

        const normalizedEmail = email.toLowerCase().trim();

        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, normalizedEmail), ne(users.id, userId)));
        if (existing) throw new ValidationError("An account with this email already exists");

        updateFields.email = normalizedEmail;
      }

      await db.update(users).set(updateFields).where(eq(users.id, userId));

      // Keep Stripe customer in sync. Best-effort: failures here must not fail the
      // primary profile update — they'll be reconciled manually or on next change.
      if (
        currentUser.stripeCustomerId &&
        (updateFields.email !== undefined || updateFields.name !== undefined)
      ) {
        try {
          await updateStripeCustomer(currentUser.stripeCustomerId, {
            email: updateFields.email,
            name: updateFields.name,
          });
        } catch (err) {
          request.log.error(err, "Stripe customer sync failed during profile update");
        }
      }

      return getUserProfile(userId);
    },
  );

  app.put<{ Body: { current_password: string; new_password: string } }>(
    "/auth/password",
    {
      schema: {
        body: {
          type: "object",
          required: ["current_password", "new_password"],
          properties: {
            current_password: { type: "string", minLength: 1 },
            new_password: { type: "string", minLength: 8 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const userId = getUserId(request);
      const { current_password, new_password } = request.body ?? {};

      if (!current_password) throw new ValidationError("current_password is required");
      if (!new_password) throw new ValidationError("new_password is required");

      const [user] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId));
      if (!user) throw new UnauthorizedError("User not found");

      const valid = await argon2.verify(user.passwordHash, current_password);
      if (!valid) throw new UnauthorizedError("Invalid password");

      if (new_password.length < 8) throw new ValidationError("password must be at least 8 characters");

      const passwordHash = await argon2.hash(new_password);
      await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

      return { success: true };
    },
  );

  app.delete<{ Body: { password: string } }>(
    "/auth/account",
    async (request, reply) => {
      const userId = getUserId(request);
      const { password } = request.body ?? {};

      if (!password) throw new ValidationError("password is required");

      const [user] = await db
        .select({ passwordHash: users.passwordHash, stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId));
      if (!user) throw new UnauthorizedError("User not found");

      const valid = await argon2.verify(user.passwordHash, password);
      if (!valid) throw new UnauthorizedError("Invalid password");

      // Collect image files for disk cleanup before cascade deletes them from DB
      const userImages = await db
        .select({ id: images.id, mimeType: images.mimeType })
        .from(images)
        .where(eq(images.userId, userId));

      // Stripe cleanup first — customers.del() cancels all subscriptions. If this fails,
      // we log and proceed so the local account still deletes, but retries remain safe
      // because deleteStripeCustomer is idempotent on resource_missing.
      if (user.stripeCustomerId) {
        try {
          await deleteStripeCustomer(user.stripeCustomerId);
        } catch (err) {
          request.log.error(err, "Stripe customer deletion failed during account deletion");
        }
      }

      // Delete user — CASCADE removes topics, cards, bloom_state, fsrs_state, reviews, images, oauth tokens
      await db.delete(users).where(eq(users.id, userId));

      // Best-effort cleanup of image files from disk
      for (const img of userImages) {
        const filePath = path.join(config.imagePath, `${img.id}${extFromMime(img.mimeType)}`);
        await unlink(filePath).catch(() => {});
      }

      return reply.code(204).send();
    },
  );
}
