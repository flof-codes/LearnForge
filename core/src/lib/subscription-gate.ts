export interface SubscriptionState {
  trialEndsAt: Date;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: Date | null;
}

export interface SubscriptionCheck {
  isActive: boolean;
  hasActiveTrial: boolean;
  hasActiveSubscription: boolean;
  isFree: boolean;
}

// trialing = user is in a Stripe-side paid trial; past_due = renewal failed, Stripe is retrying
// (period_end > now check below preserves the grace window — once Stripe gives up the sub
// transitions to unpaid/canceled and access is revoked).
const ENTITLEMENT_STATUSES = new Set(["active", "trialing", "past_due"]);

export function checkSubscriptionAccess(
  state: SubscriptionState,
  now: Date = new Date(),
): SubscriptionCheck {
  const hasActiveTrial = state.trialEndsAt > now;
  const hasActiveSubscription =
    state.subscriptionStatus != null &&
    ENTITLEMENT_STATUSES.has(state.subscriptionStatus) &&
    state.subscriptionCurrentPeriodEnd != null &&
    state.subscriptionCurrentPeriodEnd > now;
  const isFree = state.subscriptionStatus === "free";

  return {
    hasActiveTrial,
    hasActiveSubscription,
    isFree,
    isActive: hasActiveTrial || hasActiveSubscription || isFree,
  };
}
