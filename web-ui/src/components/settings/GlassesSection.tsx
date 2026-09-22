import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Glasses, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { glassesService } from '../../api/glasses';

/**
 * Admin-only settings block: pairs the Even Realities G2 app by the one-time
 * code the glasses display, and lists the tokens that pairing issued.
 */
export default function GlassesSection() {
  const { t } = useTranslation(['app']);
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: tokens = [] } = useQuery({
    queryKey: ['glasses-tokens'],
    queryFn: () => glassesService.list().then(r => r.data),
  });

  const claimMutation = useMutation({
    mutationFn: (value: string) => glassesService.claim(value).then(r => r.data),
    onSuccess: () => {
      setCode('');
      setMessage({ type: 'success', text: t('app:settings.glasses.connected') });
      queryClient.invalidateQueries({ queryKey: ['glasses-tokens'] });
    },
    onError: (error: Error) => {
      const axErr = error as import('axios').AxiosError<{ error?: string }>;
      setMessage({ type: 'error', text: axErr.response?.data?.error || error.message });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => glassesService.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['glasses-tokens'] }),
  });

  const normalized = code.replace(/[\s-]/g, '').toUpperCase();

  return (
    <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Glasses size={20} className="text-accent-blue" />
        <h2 className="text-lg font-medium text-text-primary">{t('app:settings.glasses.title')}</h2>
      </div>
      <p className="text-text-muted text-sm">{t('app:settings.glasses.description')}</p>

      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => { e.preventDefault(); if (normalized) claimMutation.mutate(normalized); }}
      >
        <div className="flex-1">
          <label htmlFor="glasses-code" className="block text-sm text-text-muted mb-1">
            {t('app:settings.glasses.codeLabel')}
          </label>
          <input
            id="glasses-code"
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setMessage(null); }}
            placeholder={t('app:settings.glasses.codePlaceholder')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary text-sm font-mono tracking-widest focus:outline-none focus:border-accent-blue"
          />
        </div>
        <button
          type="submit"
          disabled={normalized.length < 6 || claimMutation.isPending}
          className="sm:self-end px-5 py-2.5 bg-accent-blue text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {claimMutation.isPending ? t('app:settings.glasses.connecting') : t('app:settings.glasses.connect')}
        </button>
      </form>
      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-500' : 'text-danger'}`}>{message.text}</p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-text-primary">{t('app:settings.glasses.devices')}</h3>
        {tokens.length === 0 ? (
          <p className="text-text-muted text-sm">{t('app:settings.glasses.noDevices')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tokens.map((tok) => (
              <li key={tok.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="text-sm">
                  <p className="text-text-primary">{tok.label}</p>
                  <p className="text-text-muted text-xs">
                    {t('app:settings.glasses.created', { date: new Date(tok.createdAt).toLocaleDateString() })}
                    {' · '}
                    {tok.lastUsedAt
                      ? t('app:settings.glasses.lastUsed', { date: new Date(tok.lastUsedAt).toLocaleDateString() })
                      : t('app:settings.glasses.neverUsed')}
                    {' · '}
                    {t('app:settings.glasses.expires', { date: new Date(tok.expiresAt).toLocaleDateString() })}
                  </p>
                </div>
                <button
                  onClick={() => revokeMutation.mutate(tok.id)}
                  disabled={revokeMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {revokeMutation.isPending ? t('app:settings.glasses.revoking') : t('app:settings.glasses.revoke')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
