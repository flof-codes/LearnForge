import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, CheckCircle, XCircle, Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { billingService } from '../../api/auth';

function computeTrialDays(trialEndsAt: string | undefined | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [banner, setBanner] = useState<{ type: 'success' | 'canceled'; message: string } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Handle Stripe redirect params
  const successParam = searchParams.get('success');
  const canceledParam = searchParams.get('canceled');

  useEffect(() => {
    if (successParam !== 'true' && canceledParam !== 'true') return;

    // Use microtask to avoid synchronous setState in effect body
    void Promise.resolve().then(() => {
      if (successParam === 'true') {
        setBanner({ type: 'success', message: 'Subscription activated! Thank you for supporting LearnForge.' });
        refreshUser();
      } else if (canceledParam === 'true') {
        setBanner({ type: 'canceled', message: 'Checkout was canceled. You can try again anytime.' });
      }
      setSearchParams({}, { replace: true });
    });
  }, [successParam, canceledParam, setSearchParams, refreshUser]);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data } = await billingService.createCheckout();
      window.location.href = data.url;
    } catch {
      setBanner({ type: 'canceled', message: 'Failed to start checkout. Please try again.' });
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await billingService.createPortalSession();
      window.location.href = data.url;
    } catch {
      setBanner({ type: 'canceled', message: 'Failed to open billing portal. Please try again.' });
      setPortalLoading(false);
    }
  };

  const trialDaysRemaining = computeTrialDays(user?.trialEndsAt);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Billing</h1>
        <p className="text-text-muted mt-1">Manage your subscription and billing</p>
      </div>

      {/* Success/Canceled Banner */}
      {banner && (
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          banner.type === 'success'
            ? 'bg-green-900/20 border-green-600/30 text-green-400'
            : 'bg-yellow-900/20 border-yellow-600/30 text-yellow-400'
        }`}>
          {banner.type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
          <span className="text-sm">{banner.message}</span>
        </div>
      )}

      {/* Subscription Status */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CreditCard size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">Subscription Status</h2>
        </div>

        {user?.hasActiveSubscription ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
              Active
            </span>
            <span className="text-text-muted text-sm">
              {user.subscriptionStatus === 'active' ? 'Renews automatically' : user.subscriptionStatus}
            </span>
          </div>
        ) : user?.hasActiveTrial ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-blue/20 text-accent-blue">
              Trial
            </span>
            <span className="text-text-muted text-sm">
              {trialDaysRemaining} {trialDaysRemaining === 1 ? 'day' : 'days'} remaining
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-danger/20 text-danger">
              Expired
            </span>
            <span className="text-text-muted text-sm">Your trial has expired</span>
          </div>
        )}
      </section>

      {/* Subscribe */}
      {!user?.hasActiveSubscription && (
        <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-medium text-text-primary">Subscribe</h2>
          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {checkoutLoading ? 'Redirecting...' : 'Subscribe — EUR 24/year'}
          </button>
          <p className="text-text-muted text-xs text-center">EUR 2/month, billed annually</p>
        </section>
      )}

      {/* Manage Subscription */}
      {user?.hasStripeCustomer && (
        <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-medium text-text-primary">Manage Subscription</h2>
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="w-full py-2.5 bg-bg-primary border border-border text-text-primary rounded-lg font-medium hover:bg-bg-surface transition-colors disabled:opacity-50"
          >
            {portalLoading ? 'Redirecting...' : 'Open Billing Portal'}
          </button>
        </section>
      )}

      {/* VAT Note */}
      <p className="text-text-muted text-xs">
        Preise inkl. aller Abgaben. Es wird keine Umsatzsteuer ausgewiesen (Kleinunternehmerregelung gem. &sect; 6 Abs 1 Z 27 UStG).
      </p>

      {/* Donation */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Heart size={20} className="text-accent-purple" />
          <h2 className="text-lg font-medium text-text-primary">Support LearnForge</h2>
        </div>
        <p className="text-text-muted text-sm">
          LearnForge is an early-stage project. If you&apos;d like to support development, you can make a one-time donation.
        </p>
        <a
          href="https://donate.stripe.com/placeholder"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-accent-blue text-sm hover:underline"
        >
          Make a Donation
        </a>
      </section>
    </div>
  );
}
