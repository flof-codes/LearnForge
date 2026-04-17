import Stripe from "stripe";
import { config } from "../config.js";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(config.stripeSecretKey);
  }
  return _stripe;
}

export async function createStripeCustomer(email: string, name: string): Promise<string> {
  const customer = await getStripe().customers.create({ email, name });
  return customer.id;
}

export async function deleteStripeCustomer(customerId: string): Promise<void> {
  try {
    await getStripe().customers.del(customerId);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.code === "resource_missing") {
      return;
    }
    throw err;
  }
}

export async function updateStripeCustomer(
  customerId: string,
  fields: { email?: string; name?: string },
): Promise<void> {
  await getStripe().customers.update(customerId, fields);
}

export async function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session.url;
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

export function constructWebhookEvent(
  payload: Buffer,
  signature: string,
): Stripe.Event {
  return getStripe().webhooks.constructEvent(payload, signature, config.stripeWebhookSecret);
}
