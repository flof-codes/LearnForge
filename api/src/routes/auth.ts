import { FastifyBaseLogger, FastifyInstance } from "fastify";
import argon2 from "argon2";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../db/connection.js";
import {
  users,
  images,
  checkSubscriptionAccess,
  extFromMime,
  createAuthToken,
  consumeAuthToken,
  invalidateAuthTokens,
} from "@learnforge/core";
import { and, eq, ne, sql } from "drizzle-orm";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";
import { config } from "../config.js";
import { deleteStripeCustomer, updateStripeCustomer } from "../services/stripe.js";
import { sendMail } from "../services/mailer.js";
import {
  buildPasswordResetMail,
  buildVerificationMail,
  normalizeLocale,
} from "../services/mail-templates.js";

export default async function authRoutes(app: FastifyInstance) {
  /**
   * Issues a verification token and mails it.
   *
   * Errors propagate — the resend endpoint needs the cooldown ValidationError to
   * reach the client as a 400. Callers for which mail is a side effect of a
   * different operation (registration, e-mail change) must catch.
   */
  async function sendVerificationMail(
    log: FastifyBaseLogger,
    userId: string,
    email: string,
    locale?: string,
  ) {
    const token = await createAuthToken(db, userId, "email_verify");
    const url = `${config.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const delivered = await sendMail(buildVerificationMail(email, url, normalizeLocale(locale)));
    if (!delivered) log.warn({ userId }, "Verification mail was not delivered");
  }

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

  app.post<{ Body: { email: string; password: string; name: string; locale?: string } }>(
    "/auth/register",
    async (request, reply) => {
      const { email, password, name, locale } = request.body ?? {};
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
          // Stripe webhooks have no request context, so the language the user
          // signed up in is the only thing later billing mails can go on.
          locale: normalizeLocale(locale),
        })
        .returning({ id: users.id });

      // Best-effort: a dead mail server must not cost the user their sign-up.
      // They can trigger a resend from the banner once inside.
      try {
        await sendVerificationMail(request.log, user.id, normalizedEmail, locale);
      } catch (err) {
        request.log.error(err, "Verification mail failed during registration");
      }

      const token = app.jwt.sign({ sub: user.id });
      return reply.status(201).send({ token });
    },
  );

  app.post<{ Body: { locale?: string } }>("/auth/verify-email/request", async (request) => {
    const userId = getUserId(request);

    const [user] = await db
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedError("User not found");

    if (user.emailVerifiedAt) return { success: true, already_verified: true };

    await sendVerificationMail(request.log, userId, user.email, request.body?.locale);
    return { success: true, already_verified: false };
  });

  app.post<{ Body: { token: string } }>(
    "/auth/verify-email/confirm",
    {
      schema: {
        body: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string", minLength: 1 } },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const userId = await consumeAuthToken(db, request.body.token, "email_verify");
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
      return { success: true };
    },
  );

  app.post<{ Body: { email: string; locale?: string } }>(
    "/auth/password-reset/request",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", minLength: 1 },
            locale: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const normalizedEmail = request.body.email.toLowerCase().trim();

      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail));

      // Always answer the same way, whether or not the account exists — and
      // swallow the cooldown error too, since a 400 on the second attempt would
      // itself confirm that the address is registered.
      if (user) {
        try {
          const token = await createAuthToken(db, user.id, "password_reset");
          const url = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
          const delivered = await sendMail(
            buildPasswordResetMail(normalizedEmail, url, normalizeLocale(request.body.locale)),
          );
          if (!delivered) request.log.warn({ userId: user.id }, "Password reset mail was not delivered");
        } catch (err) {
          request.log.error(err, "Password reset mail failed");
        }
      }

      return { success: true };
    },
  );

  app.post<{ Body: { token: string; new_password: string } }>(
    "/auth/password-reset/confirm",
    {
      schema: {
        body: {
          type: "object",
          required: ["token", "new_password"],
          properties: {
            token: { type: "string", minLength: 1 },
            new_password: { type: "string", minLength: 8 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const { token, new_password } = request.body;
      if (new_password.length < 8) throw new ValidationError("password must be at least 8 characters");

      const userId = await consumeAuthToken(db, token, "password_reset");
      const passwordHash = await argon2.hash(new_password);

      // Receiving the mail proves control of the address, so a reset also
      // settles verification for accounts that never confirmed it.
      await db
        .update(users)
        .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
        .where(eq(users.id, userId));

      // Any other outstanding reset link is now stale — burn it, so an older
      // mail sitting in the inbox cannot take the account back over.
      await invalidateAuthTokens(db, userId, "password_reset");

      return { success: true };
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
        emailVerifiedAt: users.emailVerifiedAt,
        locale: users.locale,
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
      emailVerified: !!user.emailVerifiedAt,
      locale: user.locale,
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

  app.put<{ Body: { name?: string; email?: string; current_password?: string; locale?: string } }>(
    "/auth/profile",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            current_password: { type: "string" },
            locale: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const userId = getUserId(request);
      const { name, email, current_password, locale } = request.body ?? {};

      if (!name && !email && !locale) throw new ValidationError("name or email is required");

      const [currentUser] = await db
        .select({
          passwordHash: users.passwordHash,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, userId));
      if (!currentUser) throw new UnauthorizedError("User not found");

      const updateFields: Partial<typeof users.$inferInsert> = {};

      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) throw new ValidationError("name cannot be empty");
        updateFields.name = trimmedName;
      }

      if (locale !== undefined) updateFields.locale = normalizeLocale(locale);

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
        // The new address is unproven — drop verification and re-confirm it.
        updateFields.emailVerifiedAt = null;
      }

      await db.update(users).set(updateFields).where(eq(users.id, userId));

      if (updateFields.email) {
        try {
          await sendVerificationMail(request.log, userId, updateFields.email, locale);
        } catch (err) {
          request.log.error(err, "Verification mail failed after e-mail change");
        }
      }

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
