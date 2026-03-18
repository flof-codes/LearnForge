import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Copy, Check, AlertTriangle, Trash2, Globe, Monitor, Sun, Moon, MonitorSmartphone, CreditCard, CheckCircle, XCircle, Heart } from 'lucide-react';
import { authService, billingService } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

const themeOptions = [
  { value: 'auto' as const, label: 'Auto', icon: MonitorSmartphone },
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
];

function computeTrialDays(trialEndsAt: string | undefined | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function McpSettingsPage() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mcpUrl = `${window.location.origin}/mcp`;

  // Billing state
  const [searchParams, setSearchParams] = useSearchParams();
  const [banner, setBanner] = useState<{ type: 'success' | 'canceled'; message: string } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const successParam = searchParams.get('success');
  const canceledParam = searchParams.get('canceled');

  useEffect(() => {
    if (successParam !== 'true' && canceledParam !== 'true') return;

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

  const { data: status, isLoading } = useQuery({
    queryKey: ['mcp-key-status'],
    queryFn: () => authService.getMcpKeyStatus().then(r => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () => authService.generateMcpKey().then(r => r.data),
    onSuccess: (data) => {
      setNewKey(data.key);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ['mcp-key-status'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => authService.revokeMcpKey(),
    onSuccess: () => {
      setNewKey(null);
      queryClient.invalidateQueries({ queryKey: ['mcp-key-status'] });
    },
  });

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  if (isLoading) {
    return <div className="p-6 text-text-muted">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-text-muted mt-1">Appearance, billing, and MCP integration</p>
      </div>

      {/* Stripe redirect banner */}
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

      {/* Theme */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Sun size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">Theme</h2>
        </div>
        <div className="flex items-center rounded-lg border border-border overflow-hidden w-fit">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                theme === value
                  ? 'bg-accent-blue/15 text-accent-blue font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Subscription Status */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CreditCard size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">Subscription</h2>
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

        {!user?.hasActiveSubscription && (
          <>
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {checkoutLoading ? 'Redirecting...' : 'Subscribe — EUR 24/year'}
            </button>
            <p className="text-text-muted text-xs text-center">EUR 2/month, billed annually</p>
          </>
        )}

        {user?.hasStripeCustomer && (
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="w-full py-2.5 bg-bg-primary border border-border text-text-primary rounded-lg font-medium hover:bg-bg-surface transition-colors disabled:opacity-50"
          >
            {portalLoading ? 'Redirecting...' : 'Open Billing Portal'}
          </button>
        )}

        <p className="text-text-muted text-xs">
          Preise inkl. aller Abgaben. Es wird keine Umsatzsteuer ausgewiesen (Kleinunternehmerregelung gem. &sect; 6 Abs 1 Z 27 UStG).
        </p>
      </section>

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

      {/* Key Status */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Key size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">API Key</h2>
        </div>

        {status?.hasKey ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary text-sm">Key active</p>
              <p className="text-text-muted text-xs">
                Created {status.createdAt ? new Date(status.createdAt).toLocaleDateString() : 'unknown'}
              </p>
            </div>
            <button
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              {revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
            </button>
          </div>
        ) : (
          <p className="text-text-muted text-sm">No API key configured</p>
        )}

        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {generateMutation.isPending ? 'Generating...' : status?.hasKey ? 'Regenerate Key' : 'Generate Key'}
        </button>
      </section>

      {/* Show new key (only once) */}
      {newKey && (
        <section className="bg-bg-secondary rounded-xl border border-yellow-600/30 p-6 space-y-4">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle size={18} />
            <h3 className="font-medium">Save your API key</h3>
          </div>
          <p className="text-text-muted text-sm">
            This key will only be shown once. Copy it now and store it securely.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-bg-primary px-4 py-2.5 rounded-lg text-sm text-text-primary font-mono break-all border border-border">
              {newKey}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-2.5 bg-bg-primary border border-border rounded-lg hover:bg-subtle-hover transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-text-muted" />}
            </button>
          </div>
        </section>
      )}

      {/* Claude Desktop Tutorial */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Monitor size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">Claude Desktop Setup</h2>
        </div>
        <p className="text-text-muted text-sm">
          Add this to your <code className="text-text-primary bg-bg-primary px-1.5 py-0.5 rounded text-xs">claude_desktop_config.json</code>:
        </p>
        <pre className="bg-bg-primary rounded-lg p-4 text-sm text-text-primary overflow-x-auto border border-border">
{JSON.stringify({
  mcpServers: {
    learnforge: {
      command: "npx",
      args: ["tsx", "/path/to/mcp/src/index.ts", "--stdio", "--api-key", "YOUR_KEY_HERE"]
    }
  }
}, null, 2)}
        </pre>
        <p className="text-text-muted text-xs">
          Replace <code className="text-text-primary">/path/to/mcp/src/index.ts</code> with the actual path and <code className="text-text-primary">YOUR_KEY_HERE</code> with your API key.
        </p>
      </section>

      {/* Claude Web Tutorial */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Globe size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">Claude Web (claude.ai) Setup</h2>
        </div>
        <ol className="text-text-muted text-sm space-y-2 list-decimal list-inside">
          <li>Open <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">claude.ai</a> and go to <strong className="text-text-primary">Settings</strong></li>
          <li>Navigate to the <strong className="text-text-primary">Integrations</strong> tab</li>
          <li>Click <strong className="text-text-primary">Add</strong> to add a custom integration</li>
          <li>Enter a name, e.g. <code className="text-text-primary bg-bg-primary px-1.5 py-0.5 rounded text-xs">LearnForge</code></li>
          <li>Set the server URL to:</li>
        </ol>
        <pre className="bg-bg-primary rounded-lg p-4 text-sm text-text-primary overflow-x-auto border border-border">{mcpUrl}</pre>
        <ol start={6} className="text-text-muted text-sm space-y-2 list-decimal list-inside">
          <li>Claude.ai will redirect you to sign in with your LearnForge credentials</li>
          <li>After signing in, LearnForge tools will appear in your conversations</li>
        </ol>
        <p className="text-text-muted text-xs">
          Authentication uses OAuth 2.0 — no API key needed for Claude Web.
        </p>
      </section>

      {/* Other AI Assistants */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-3">
        <h2 className="text-lg font-medium text-text-primary">Other AI Assistants</h2>
        <p className="text-text-muted text-sm">
          <strong className="text-text-primary">ChatGPT:</strong> The desktop app supports local MCP servers (stdio transport only). Remote HTTP servers are not supported — you would need to clone the repo and use stdio mode.
        </p>
        <p className="text-text-muted text-sm">
          <strong className="text-text-primary">Gemini:</strong> Google has MCP support through the Agent Development Kit (ADK) for developers, but the consumer Gemini app does not support custom MCP integrations.
        </p>
      </section>
    </div>
  );
}
