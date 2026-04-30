import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "@learnforge/core";
import { getStripe } from "./stripe.js";

const ENTITLEMENT_PRIORITY: Record<string, number> = {
  active: 1,
  trialing: 2,
  past_due: 3,
};

function isEntitlementValid(status: string | null | undefined): boolean {
  return status != null && status in ENTITLEMENT_PRIORITY;
}

function pickEntitlementSubscription(
  subs: Stripe.Subscription[],
): Stripe.Subscription | null {
  const candidates = subs.filter((s) => isEntitlementValid(s.status));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const pa = ENTITLEMENT_PRIORITY[a.status] ?? 99;
    const pb = ENTITLEMENT_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.created ?? 0) - (a.created ?? 0);
  });
  return candidates[0];
}

function pickVisibilitySubscription(
  subs: Stripe.Subscription[],
): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  const sorted = [...subs].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return sorted[0];
}

function readPeriodEnd(sub: Stripe.Subscription): number | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;
  const legacyEnd = (sub as Stripe.Subscription & { current_period_end?: number })
    .current_period_end;
  if (typeof legacyEnd === "number") return legacyEnd;
  return null;
}

export interface SyncResult {
  matchedSubscriptionId: string | null;
  status: string | null;
  currentPeriodEnd: Date | null;
  source: "entitlement" | "visibility" | "none";
  rowsUpdated: number;
}

export interface BulkSyncResult {
  total: number;
  succeeded: number;
  skippedFree: number;
  failed: Array<{ userId: string; customerId: string; error: string }>;
}

export async function syncStripeSubscriptionsForAllCustomers(): Promise<BulkSyncResult> {
  const rows = await db
    .select({
      id: users.id,
      stripeCustomerId: users.stripeCustomerId,
      subscriptionStatus: users.subscriptionStatus,
    })
    .from(users);
  const linked = rows.filter(
    (r): r is typeof r & { stripeCustomerId: string } => r.stripeCustomerId != null,
  );

  const result: BulkSyncResult = {
    total: linked.length,
    succeeded: 0,
    skippedFree: 0,
    failed: [],
  };

  for (const row of linked) {
    // Respect admin 'free' override — bulk sync should not overwrite it.
    if (row.subscriptionStatus === "free") {
      result.skippedFree += 1;
      continue;
    }
    try {
      await syncStripeSubscriptionForCustomer(row.stripeCustomerId);
      result.succeeded += 1;
    } catch (err) {
      result.failed.push({
        userId: row.id,
        customerId: row.stripeCustomerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export async function syncStripeSubscriptionForCustomer(
  customerId: string,
): Promise<SyncResult> {
  const stripe = getStripe();

  for (const status of ["active", "trialing", "past_due"] as const) {
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 1,
    });
    if (list.data.length > 0) {
      return await applySyncResult(customerId, list.data);
    }
  }

  const all: Stripe.Subscription[] = [];
  for await (const sub of stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  })) {
    all.push(sub);
  }

  return await applySyncResult(customerId, all);
}

export async function syncStripeSubscriptionById(
  customerId: string,
  subscriptionId: string,
): Promise<SyncResult> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if ((sub.customer as string) !== customerId) {
    throw new Error(
      `Subscription ${subscriptionId} does not belong to customer ${customerId}`,
    );
  }
  return await applySyncResult(customerId, [sub]);
}

async function applySyncResult(
  customerId: string,
  subs: Stripe.Subscription[],
): Promise<SyncResult> {
  const entitlement = pickEntitlementSubscription(subs);

  if (entitlement) {
    const periodEndSeconds = readPeriodEnd(entitlement);
    const currentPeriodEnd =
      periodEndSeconds != null ? new Date(periodEndSeconds * 1000) : null;

    // All entitlement statuses (active/trialing/past_due) require period_end
    // because the gate enforces period_end > now. Writing status without it
    // would silently lock the user out.
    if (currentPeriodEnd == null) {
      throw new Error(
        `Refusing to write entitlement status='${entitlement.status}' without a valid current_period_end for subscription ${entitlement.id}`,
      );
    }

    const updated = await db
      .update(users)
      .set({
        stripeSubscriptionId: entitlement.id,
        subscriptionStatus: entitlement.status,
        subscriptionCurrentPeriodEnd: currentPeriodEnd,
      })
      .where(eq(users.stripeCustomerId, customerId))
      .returning({ id: users.id });

    return {
      matchedSubscriptionId: entitlement.id,
      status: entitlement.status,
      currentPeriodEnd,
      source: "entitlement",
      rowsUpdated: updated.length,
    };
  }

  const visibility = pickVisibilitySubscription(subs);
  if (visibility) {
    // Don't link stripe_subscription_id to non-entitlement subs (incomplete_expired etc.).
    // Status is written for admin visibility; gate denies access regardless.
    const updated = await db
      .update(users)
      .set({
        stripeSubscriptionId: null,
        subscriptionStatus: visibility.status,
        subscriptionCurrentPeriodEnd: null,
      })
      .where(eq(users.stripeCustomerId, customerId))
      .returning({ id: users.id });

    return {
      matchedSubscriptionId: null,
      status: visibility.status,
      currentPeriodEnd: null,
      source: "visibility",
      rowsUpdated: updated.length,
    };
  }

  const updated = await db
    .update(users)
    .set({
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      subscriptionCurrentPeriodEnd: null,
    })
    .where(eq(users.stripeCustomerId, customerId))
    .returning({ id: users.id });

  return {
    matchedSubscriptionId: null,
    status: null,
    currentPeriodEnd: null,
    source: "none",
    rowsUpdated: updated.length,
  };
}

// ── Pure routing decision (testable without Stripe) ─────────────────────────

export type RoutingDecision =
  | { action: "process" }
  | { action: "adopt" }
  | { action: "ignore"; reason: "stale-sub" | "non-entitlement-no-stored" };

const ENTITLEMENT_STATUSES = new Set(["active", "trialing", "past_due"]);

export function decideSubscriptionEventRouting(
  storedSubscriptionId: string | null,
  eventSubscriptionId: string,
  eventStatus: string,
): RoutingDecision {
  if (storedSubscriptionId === eventSubscriptionId) {
    return { action: "process" };
  }
  if (storedSubscriptionId == null) {
    if (ENTITLEMENT_STATUSES.has(eventStatus)) {
      return { action: "adopt" };
    }
    return { action: "ignore", reason: "non-entitlement-no-stored" };
  }
  return { action: "ignore", reason: "stale-sub" };
}
