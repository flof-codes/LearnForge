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

export function checkSubscriptionAccess(
  state: SubscriptionState,
  now: Date = new Date(),
): SubscriptionCheck {
  const hasActiveTrial = state.trialEndsAt > now;
  const hasActiveSubscription =
    state.subscriptionStatus === "active" &&
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
