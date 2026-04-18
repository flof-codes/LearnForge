import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Shield, UserCheck, UserX } from 'lucide-react';
import { adminService } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorFallback from '../../components/ErrorFallback';
import ConfirmModal from '../../components/ConfirmModal';
import type { AdminUser } from '../../types';

const PAGE_SIZE = 50;

export default function AdminDashboardPage() {
  const { t } = useTranslation('app');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [pendingAction, setPendingAction] = useState<
    { kind: 'grant' | 'revoke'; user: AdminUser } | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminService.getStats().then((r) => r.data),
  });

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { search, limit: PAGE_SIZE, offset }],
    queryFn: () =>
      adminService
        .listUsers({ search: search || undefined, limit: PAGE_SIZE, offset })
        .then((r) => r.data),
  });

  const grantMutation = useMutation({
    mutationFn: (userId: string) => adminService.grantFree(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setPendingAction(null);
      setActionError(null);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        ?? (err as Error).message;
      setActionError(message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => adminService.revokeFree(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setPendingAction(null);
      setActionError(null);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        ?? (err as Error).message;
      setActionError(message);
    },
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const handleConfirm = () => {
    if (!pendingAction) return;
    setActionError(null);
    if (pendingAction.kind === 'grant') {
      grantMutation.mutate(pendingAction.user.id);
    } else {
      revokeMutation.mutate(pendingAction.user.id);
    }
  };

  if (statsQuery.isLoading || usersQuery.isLoading) return <LoadingSpinner />;
  if (statsQuery.isError) {
    return <ErrorFallback message={(statsQuery.error as Error).message} onReset={() => statsQuery.refetch()} />;
  }
  if (usersQuery.isError) {
    return <ErrorFallback message={(usersQuery.error as Error).message} onReset={() => usersQuery.refetch()} />;
  }

  const stats = statsQuery.data!;
  const usersPage = usersQuery.data!;
  const totalPages = Math.max(1, Math.ceil(usersPage.total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Shield size={22} className="text-accent-blue" />
        <h1 className="text-2xl font-medium">{t('admin.title')}</h1>
      </div>

      {/* Stats row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('admin.stats.totalUsers')} value={stats.totalUsers} />
        <StatCard label={t('admin.stats.billableTotal')} value={stats.billable.totalBillable} />
        <StatCard label={t('admin.stats.freeAdmin')} value={stats.billable.freeAdmin} highlight />
        <StatCard label={t('admin.stats.trialActive')} value={stats.freeTrial.trialActive} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-secondary rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium text-text-muted mb-3">{t('admin.sections.billable')}</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label={t('admin.stats.active')} value={stats.billable.active} />
            <Row label={t('admin.stats.trialing')} value={stats.billable.trialing} />
            <Row label={t('admin.stats.pastDue')} value={stats.billable.pastDue} />
            <Row label={t('admin.stats.freeAdmin')} value={stats.billable.freeAdmin} />
            <Row label={t('admin.stats.billableTotal')} value={stats.billable.totalBillable} bold />
          </dl>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium text-text-muted mb-3">{t('admin.sections.freeTrial')}</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label={t('admin.stats.trialActive')} value={stats.freeTrial.trialActive} />
            <Row label={t('admin.stats.trialExpired')} value={stats.freeTrial.trialExpired} />
            <Row label={t('admin.stats.totalFree')} value={stats.freeTrial.totalFree} bold />
          </dl>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium text-text-muted mb-3">{t('admin.sections.activity')}</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label={t('admin.stats.usersWithCards')} value={stats.activity.usersWithCards} />
            <Row label={t('admin.stats.usersWithReviews')} value={stats.activity.usersWithReviews} />
          </dl>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium text-text-muted mb-3">{t('admin.sections.statusBreakdown')}</h2>
          <dl className="space-y-1.5 text-sm">
            {stats.statusBreakdown.map((row) => (
              <Row key={row.status} label={row.status} value={row.count} />
            ))}
          </dl>
        </div>
      </section>

      {/* Users table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-medium">{t('admin.users.title')}</h2>
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('admin.users.searchPlaceholder')}
              className="pl-9 pr-3 py-2 rounded-lg text-sm bg-bg-secondary border border-border focus:outline-none focus:border-accent-blue w-64"
            />
          </form>
        </div>

        <div className="bg-bg-secondary rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-text-muted text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">{t('admin.users.email')}</th>
                <th className="text-left px-4 py-3">{t('admin.users.role')}</th>
                <th className="text-left px-4 py-3">{t('admin.users.status')}</th>
                <th className="text-right px-4 py-3">{t('admin.users.cards')}</th>
                <th className="text-right px-4 py-3">{t('admin.users.reviews')}</th>
                <th className="text-left px-4 py-3">{t('admin.users.created')}</th>
                <th className="text-right px-4 py-3">{t('admin.users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {usersPage.users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{user.email}</div>
                    <div className="text-xs text-text-muted">{user.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} t={t} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge user={user} t={t} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{user.cardCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{user.reviewCount}</td>
                  <td className="px-4 py-3 text-text-muted text-xs">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.subscriptionStatus === 'free' ? (
                      <button
                        disabled={user.role === 'admin'}
                        onClick={() => setPendingAction({ kind: 'revoke', user })}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={user.role === 'admin' ? t('admin.users.cannotRevokeAdmin') : ''}
                      >
                        <UserX size={14} />
                        {t('admin.users.revokeFree')}
                      </button>
                    ) : (
                      <button
                        onClick={() => setPendingAction({ kind: 'grant', user })}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors"
                      >
                        <UserCheck size={14} />
                        {t('admin.users.grantFree')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {usersPage.users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-muted text-sm">
                    {t('admin.users.noMatches')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>
              {t('admin.users.pageOf', { current: currentPage, total: totalPages, count: usersPage.total })}
            </span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="px-3 py-1.5 rounded-md bg-bg-secondary border border-border disabled:opacity-40"
              >
                {t('admin.users.prev')}
              </button>
              <button
                disabled={offset + PAGE_SIZE >= usersPage.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-md bg-bg-secondary border border-border disabled:opacity-40"
              >
                {t('admin.users.next')}
              </button>
            </div>
          </div>
        )}
      </section>

      {actionError && (
        <div className="fixed bottom-4 right-4 bg-danger text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          {actionError}
        </div>
      )}

      <ConfirmModal
        open={pendingAction !== null}
        title={
          pendingAction?.kind === 'grant'
            ? t('admin.confirm.grantTitle')
            : t('admin.confirm.revokeTitle')
        }
        message={
          pendingAction?.kind === 'grant'
            ? t('admin.confirm.grantMessage', { email: pendingAction.user.email })
            : t('admin.confirm.revokeMessage', { email: pendingAction?.user.email ?? '' })
        }
        confirmLabel={
          pendingAction?.kind === 'grant'
            ? t('admin.users.grantFree')
            : t('admin.users.revokeFree')
        }
        danger={pendingAction?.kind === 'revoke'}
        onConfirm={handleConfirm}
        onCancel={() => {
          setPendingAction(null);
          setActionError(null);
        }}
      />
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-accent-blue/5 border-accent-blue/30' : 'bg-bg-secondary border-border'}`}>
      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-medium tabular-nums">{value}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-medium pt-1.5 mt-1.5 border-t border-border' : ''}`}>
      <dt className="text-text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function RoleBadge({ role, t }: { role: 'user' | 'admin'; t: (k: string) => string }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-accent-blue/10 text-accent-blue font-medium">
        <Shield size={11} />
        {t('admin.users.roleAdmin')}
      </span>
    );
  }
  return <span className="text-text-muted text-xs">{t('admin.users.roleUser')}</span>;
}

function StatusBadge({ user, t }: { user: AdminUser; t: (k: string) => string }) {
  const status = user.subscriptionStatus;
  if (status === 'free') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-accent-blue/10 text-accent-blue font-medium">
        {t('admin.status.free')}
      </span>
    );
  }
  if (status === 'active') {
    return <span className="px-2 py-0.5 rounded-md text-xs bg-accent-green/10 text-accent-green font-medium">{t('admin.status.active')}</span>;
  }
  if (status === 'trialing') {
    return <span className="px-2 py-0.5 rounded-md text-xs bg-accent-purple/10 text-accent-purple font-medium">{t('admin.status.trialing')}</span>;
  }
  if (status === 'past_due') {
    return <span className="px-2 py-0.5 rounded-md text-xs bg-warning/10 text-warning font-medium">{t('admin.status.pastDue')}</span>;
  }
  if (status === 'canceled') {
    return <span className="px-2 py-0.5 rounded-md text-xs bg-danger/10 text-danger font-medium">{t('admin.status.canceled')}</span>;
  }
  // No subscription — show trial state
  const trialActive = new Date(user.trialEndsAt) > new Date();
  return trialActive ? (
    <span className="text-text-muted text-xs">{t('admin.status.trial')}</span>
  ) : (
    <span className="text-text-muted text-xs">{t('admin.status.expired')}</span>
  );
}
