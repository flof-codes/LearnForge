import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema/index.js";
import { config } from "../config.js";
import { ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";
import {
  createStripeCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
  constructWebhookEvent,
} from "../services/stripe.js";

export default async function billingRoutes(app: FastifyInstance) {
  app.post("/billing/checkout", async (request) => {
    const userId = getUserId(request);

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

    if (user.subscriptionStatus === "active") {
      throw new ValidationError("You already have an active subscription");
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      customerId = await createStripeCustomer(user.email, user.name);
      await db
        .update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, userId));
    }

    const url = await createCheckoutSession({
      customerId,
      priceId: config.stripePriceId,
      successUrl: `${config.appUrl}/dashboard/settings/billing?success=true`,
      cancelUrl: `${config.appUrl}/dashboard/settings/billing?canceled=true`,
    });

    return { url };
  });

  app.post("/billing/portal", async (request) => {
    const userId = getUserId(request);

    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId));

    if (!user.stripeCustomerId) {
      throw new ValidationError("No billing account found");
    }

    const url = await createCustomerPortalSession(
      user.stripeCustomerId,
      `${config.appUrl}/dashboard/settings/billing`,
    );

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

      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const periodEnd = subscription.items.data[0]?.current_period_end;
          await db
            .update(users)
            .set({
              subscriptionStatus: subscription.status,
              ...(periodEnd != null && {
                subscriptionCurrentPeriodEnd: new Date(periodEnd * 1000),
              }),
            })
            .where(eq(users.stripeCustomerId, subscription.customer as string));
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await db
            .update(users)
            .set({ subscriptionStatus: "canceled" })
            .where(eq(users.stripeCustomerId, subscription.customer as string));
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await db
            .update(users)
            .set({ subscriptionStatus: "past_due" })
            .where(eq(users.stripeCustomerId, invoice.customer as string));
          break;
        }
      }

      return { received: true };
    },
  );
}
