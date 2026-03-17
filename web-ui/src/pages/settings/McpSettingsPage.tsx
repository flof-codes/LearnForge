import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Copy, Check, AlertTriangle, Trash2 } from 'lucide-react';
import { authService } from '../../api/auth';

export default function McpSettingsPage() {
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  if (isLoading) {
    return <div className="p-6 text-text-muted">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">MCP Settings</h1>
        <p className="text-text-muted mt-1">Manage your API key for Claude Desktop integration</p>
      </div>

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
              className="shrink-0 p-2.5 bg-bg-primary border border-border rounded-lg hover:bg-white/[0.04] transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-text-muted" />}
            </button>
          </div>
        </section>
      )}

      {/* Claude Desktop Tutorial */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-medium text-text-primary">Claude Desktop Setup</h2>
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
    </div>
  );
}
