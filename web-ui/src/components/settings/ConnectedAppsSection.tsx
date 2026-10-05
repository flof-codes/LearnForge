import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appsService } from '../../api/apps';
import { glassesService } from '../../api/glasses';

interface Row { key: string; kind: 'app' | 'glasses'; id: string; name: string; createdAt: string; lastUsedAt: string | null }

/**
 * Everything that holds a token of its own for this account, in one list:
 * connected apps for every user, plus the paired glasses for an admin.
 */
export default function ConnectedAppsSection({ withGlasses }: { withGlasses: boolean }) {
  const { t } = useTranslation(['app']);
  const queryClient = useQueryClient();

  const { data: apps = [] } = useQuery({ queryKey: ['app-tokens'], queryFn: () => appsService.list().then(r => r.data) });
  const { data: glasses = [] } = useQuery({
    queryKey: ['glasses-tokens'],
    queryFn: () => glassesService.list().then(r => r.data),
    enabled: withGlasses,
  });

  const revoke = useMutation({
    mutationFn: (row: Row) => (row.kind === 'app' ? appsService.revoke(row.id) : glassesService.revoke(row.id)),
    onSuccess: (_r, row) => queryClient.invalidateQueries({ queryKey: [row.kind === 'app' ? 'app-tokens' : 'glasses-tokens'] }),
  });

  const rows: Row[] = [
    ...apps.map(a => ({ key: `app-${a.id}`, kind: 'app' as const, id: a.id, name: a.device ? `${a.app} · ${a.device}` : a.app, createdAt: a.createdAt, lastUsedAt: a.lastUsedAt })),
    ...glasses.map(g => ({ key: `glasses-${g.id}`, kind: 'glasses' as const, id: g.id, name: g.label, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt })),
  ];

  return (
    <section className="lf-panel space-y-4">
      <div className="flex items-center gap-3">
        <Link2 size={20} className="text-accent-blue" />
        <h2 className="text-lg font-medium text-text-primary">{t('app:settings.apps.title')}</h2>
      </div>
      <p className="text-text-muted text-sm">{t('app:settings.apps.description')}</p>
      {rows.length === 0 ? (
        <p className="text-text-muted text-sm">{t('app:settings.apps.none')}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border md:rounded-lg md:border">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-3 md:px-4">
              <div className="text-sm min-w-0">
                <p className="text-text-primary break-words">{row.name}</p>
                <p className="text-text-muted text-xs">
                  {t('app:settings.apps.created', { date: new Date(row.createdAt).toLocaleDateString() })}
                  {' · '}
                  {row.lastUsedAt
                    ? t('app:settings.apps.lastUsed', { date: new Date(row.lastUsedAt).toLocaleDateString() })
                    : t('app:settings.apps.neverUsed')}
                </p>
              </div>
              <button
                onClick={() => revoke.mutate(row)}
                disabled={revoke.isPending}
                className="flex-none flex items-center gap-1.5 px-3 py-1.5 text-sm text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
                {t('app:settings.apps.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
