import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "@learnforge/core";
import { config } from "../config.js";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";
import {
  createStripeCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
  constructWebhookEvent,
} from "../services/stripe.js";
import {
  syncStripeSubscriptionById,
  syncStripeSubscriptionForCustomer,
  decideSubscriptionEventRouting,
} from "../services/billing-sync.js";

export default async function billingRoutes(app: FastifyInstance) {
  app.post<{ Body: { plan: string } }>("/billing/checkout", async (request) => {
    const userId = getUserId(request);
    const { plan } = request.body ?? {};

    if (plan !== "monthly" && plan !== "annual") {
      throw new ValidationError("Invalid plan. Must be 'monthly' or 'annual'");
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        stripeCustomerId: users.stripeCustomerId,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedError("User not found");

    if (user.subscriptionStatus === "free") {
      throw new ValidationError("Your account has complimentary free access; no subscription needed");
    }

    // Preflight: if user already has a Stripe customer, re-sync from Stripe before
    // creating a new Checkout. Catches DB drift (e.g. missed webhook) and prevents
    // duplicate subscriptions on the same customer.
    if (user.stripeCustomerId) {
      try {
        const synced = await syncStripeSubscriptionForCustomer(user.stripeCustomerId);
        if (
          synced.status === "active" ||
          synced.status === "trialing" ||
          synced.status === "past_due"
        ) {
          throw new ValidationError(
            "You already have a subscription. Manage it in the billing portal.",
          );
        }
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        app.log.warn(
          { err, userId, customerId: user.stripeCustomerId },
          "Checkout preflight sync failed; falling back to local DB status",
        );
        if (
          user.subscriptionStatus === "active" ||
          user.subscriptionStatus === "trialing" ||
          user.subscriptionStatus === "past_due"
        ) {
          throw new ValidationError(
            "You already have a subscription. Manage it in the billing portal.",
          );
        }
      }
    } else if (
      user.subscriptionStatus === "active" ||
      user.subscriptionStatus === "trialing" ||
      user.subscriptionStatus === "past_due"
    ) {
      // No Stripe customer yet but local row says entitlement-active — shouldn't
      // happen, but treat as "already subscribed" to be safe.
      throw new ValidationError(
        "You already have a subscription. Manage it in the billing portal.",
      );
    }

    const priceId = plan === "monthly"
      ? config.stripePriceIdMonthly
      : config.stripePriceIdAnnual;

    if (!priceId) {
      throw new ValidationError("Subscription plan not configured");
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      customerId = await createStripeCustomer(user.email, user.name);
      await db
        .update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, userId));
    }

    let url: string | null;
    try {
      url = await createCheckoutSession({
        customerId,
        priceId,
        successUrl: `${config.appUrl}/dashboard/settings/billing?success=true`,
        cancelUrl: `${config.appUrl}/dashboard/settings/billing?canceled=true`,
      });
    } catch (err) {
      app.log.error(err, "Stripe checkout session creation failed");
      throw new ValidationError("Unable to create checkout session. Please try again.");
    }

    if (!url) {
      throw new ValidationError("Unable to create checkout session. Please try again.");
    }

    return { url };
  });

  app.post("/billing/portal", async (request) => {
    const userId = getUserId(request);

    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedError("User not found");

    if (!user.stripeCustomerId) {
      throw new ValidationError("No billing account found");
    }

    let url: string;
    try {
      url = await createCustomerPortalSession(
        user.stripeCustomerId,
        `${config.appUrl}/dashboard/settings/billing`,
      );
    } catch (err) {
      app.log.error(err, "Stripe portal session creation failed");
      throw new ValidationError("Unable to open billing portal. Please try again.");
    }

    return { url };
  });

  app.post(
    "/billing/webhook",
    { config: { rawBody: true } },
    async (request, reply) => {
      const signature = request.headers["stripe-signature"];
      if (!signature) {
        return reply.status(400).send({ error: "Missing stripe-signature header" });
      }

      let event: Stripe.Event;
      try {
        event = constructWebhookEvent(
          (request as unknown as { rawBody: Buffer }).rawBody,
          signature as string,
        );
      } catch (err) {
        app.log.error(err, "Webhook signature verification failed");
        return reply.status(400).send({ error: "Webhook signature verification failed" });
      }

      try {
        await processWebhookEvent(app, event);
      } catch (err) {
        app.log.error({ err, eventId: event.id, type: event.type }, "Webhook processing failed");
        return reply.status(500).send({ error: "Webhook processing failed" });
      }

      return { received: true };
    },
  );

  async function processWebhookEvent(
    app: FastifyInstance,
    event: Stripe.Event,
  ): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;
        if (!customerId || !subscriptionId) {
          app.log.info({ eventId: event.id, customerId, subscriptionId }, "checkout.session.completed: not a subscription session, ignoring");
          return;
        }
        const [user] = await db
          .select({ id: users.id, subscriptionStatus: users.subscriptionStatus })
          .from(users)
          .where(eq(users.stripeCustomerId, customerId));
        if (user?.subscriptionStatus === "free") {
          app.log.info(
            { eventId: event.id, userId: user.id, subscriptionId },
            "checkout.session.completed ignored: user has admin free override",
          );
          return;
        }
        const result = await syncStripeSubscriptionById(customerId, subscriptionId);
        if (result.rowsUpdated === 0) {
          app.log.warn(
            { eventId: event.id, customerId, subscriptionId },
            "checkout.session.completed: no local user with this stripe_customer_id",
          );
        } else {
          app.log.info(
            { eventId: event.id, customerId, subscriptionId },
            "checkout.session.completed: linked subscription",
          );
        }
        return;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const [user] = await db
          .select({
            id: users.id,
            stripeSubscriptionId: users.stripeSubscriptionId,
            subscriptionStatus: users.subscriptionStatus,
          })
          .from(users)
          .where(eq(users.stripeCustomerId, customerId));
        if (!user) {
          app.log.warn(
            { eventId: event.id, customerId },
            "subscription event for unknown customer",
          );
          return;
        }

        // Admin 'free' override is sacred — Stripe events never overwrite it.
        if (user.subscriptionStatus === "free") {
          app.log.info(
            { eventId: event.id, userId: user.id, eventSubId: subscription.id },
            "subscription event ignored: user has admin free override",
          );
          return;
        }

        const decision = decideSubscriptionEventRouting(
          user.stripeSubscriptionId,
          subscription.id,
          subscription.status,
        );

        if (decision.action === "ignore") {
          app.log.info(
            {
              eventId: event.id,
              userId: user.id,
              storedSubId: user.stripeSubscriptionId,
              eventSubId: subscription.id,
              status: subscription.status,
              reason: decision.reason,
            },
            "subscription event ignored",
          );
          return;
        }

        await syncStripeSubscriptionById(customerId, subscription.id);
        app.log.info(
          {
            eventId: event.id,
            userId: user.id,
            subscriptionId: subscription.id,
            decision: decision.action,
          },
          "subscription event processed",
        );
        return;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const [user] = await db
          .select({
            id: users.id,
            stripeSubscriptionId: users.stripeSubscriptionId,
            subscriptionStatus: users.subscriptionStatus,
          })
          .from(users)
          .where(eq(users.stripeCustomerId, customerId));
        if (!user) return;

        if (user.subscriptionStatus === "free") {
          app.log.info(
            { eventId: event.id, userId: user.id, eventSubId: subscription.id },
            "subscription.deleted ignored: user has admin free override",
          );
          return;
        }

        if (user.stripeSubscriptionId !== subscription.id) {
          app.log.info(
            {
              eventId: event.id,
              userId: user.id,
              storedSubId: user.stripeSubscriptionId,
              eventSubId: subscription.id,
            },
            "subscription.deleted ignored: not the user's active subscription",
          );
          return;
        }

        await db
          .update(users)
          .set({
            stripeSubscriptionId: null,
            subscriptionStatus: "canceled",
            subscriptionCurrentPeriodEnd: null,
          })
          .where(eq(users.id, user.id));
        return;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        // Stripe API version transition: legacy invoice.subscription was moved to
        // invoice.parent.subscription_details.subscription in basil (2025-04-30).
        // Tolerate both shapes.
        const legacySub = (invoice as Stripe.Invoice & { subscription?: string | { id: string } })
          .subscription;
        const newSub = (
          invoice as Stripe.Invoice & {
            parent?: { subscription_details?: { subscription?: string | { id: string } } };
          }
        ).parent?.subscription_details?.subscription;
        const eventSubId = typeof legacySub === "string"
          ? legacySub
          : legacySub?.id
          ?? (typeof newSub === "string" ? newSub : newSub?.id)
          ?? null;

        if (!eventSubId) {
          app.log.info({ eventId: event.id, customerId }, "invoice.payment_failed: no subscription id");
          return;
        }

        const [user] = await db
          .select({
            id: users.id,
            stripeSubscriptionId: users.stripeSubscriptionId,
            subscriptionStatus: users.subscriptionStatus,
          })
          .from(users)
          .where(eq(users.stripeCustomerId, customerId));
        if (!user) return;

        if (user.subscriptionStatus === "free") {
          app.log.info(
            { eventId: event.id, userId: user.id, eventSubId },
            "invoice.payment_failed ignored: user has admin free override",
          );
          return;
        }

        if (user.stripeSubscriptionId !== eventSubId) {
          app.log.info(
            {
              eventId: event.id,
              userId: user.id,
              storedSubId: user.stripeSubscriptionId,
              eventSubId,
            },
            "invoice.payment_failed ignored: not the user's active subscription",
          );
          return;
        }

        await db
          .update(users)
          .set({ subscriptionStatus: "past_due" })
          .where(eq(users.id, user.id));
        return;
      }
    }
  }
}
