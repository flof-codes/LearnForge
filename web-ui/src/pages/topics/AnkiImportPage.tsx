import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, Loader2, CheckCircle2, XCircle, AlertTriangle, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ankiImportService } from '../../api/ankiImport';
import type { AnkiImport } from '../../types';

const ACTIVE = new Set(['analyzing', 'queued', 'running']);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error ?? fallback;
}

export default function AnkiImportPage() {
  const { t, i18n } = useTranslation('app');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const importId = params.get('id');
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<'keep' | 'fresh'>('keep');
  const [busy, setBusy] = useState(false);

  const { data: job } = useQuery({
    queryKey: ['ankiImport', importId],
    queryFn: () => ankiImportService.get(importId!).then(r => r.data),
    enabled: !!importId,
    refetchInterval: (q) => (q.state.data && ACTIVE.has(q.state.data.status) ? 1000 : false),
  });
  const { data: history } = useQuery({
    queryKey: ['ankiImports'],
    queryFn: () => ankiImportService.list().then(r => r.data),
  });

  const open = (id: string | null) => {
    setActionError(null);
    setParams(id ? { id } : {});
  };

  const upload = async (file: File) => {
    setActionError(null);
    setUploading(0);
    try {
      const res = await ankiImportService.upload(file, setUploading);
      queryClient.setQueryData(['ankiImport', res.data.id], res.data);
      queryClient.invalidateQueries({ queryKey: ['ankiImports'] });
      open(res.data.id);
    } catch (err) {
      setActionError(errorMessage(err, t('ankiImport.uploadFailed')));
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const commit = async (current: AnkiImport) => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await ankiImportService.commit(current.id, schedule);
      queryClient.setQueryData(['ankiImport', current.id], res.data);
    } catch (err) {
      setActionError(errorMessage(err, t('ankiImport.startFailed')));
    } finally {
      setBusy(false);
    }
  };

  const discard = async (current: AnkiImport) => {
    setBusy(true);
    try {
      await ankiImportService.remove(current.id);
      queryClient.invalidateQueries({ queryKey: ['ankiImports'] });
      open(null);
    } catch (err) {
      setActionError(errorMessage(err, t('ankiImport.discardFailed')));
    } finally {
      setBusy(false);
    }
  };

  const finished = job?.status === 'done' || job?.status === 'failed';
  useEffect(() => {
    if (!finished) return;
    queryClient.invalidateQueries({ queryKey: ['topics'] });
    queryClient.invalidateQueries({ queryKey: ['ankiImports'] });
  }, [finished, queryClient]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/dashboard/topics" className="text-text-muted hover:text-text-primary" aria-label={t('ankiImport.back')}>
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-medium">{t('ankiImport.title')}</h1>
      </div>
      <p className="text-sm text-text-muted">{t('ankiImport.intro')}</p>

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
          <span>{actionError}</span>
        </div>
      )}

      {!job && (
        <div className="lf-panel border-dashed py-8 md:p-8 text-center">
          <Layers size={36} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-muted mb-4">{t('ankiImport.pickHint')}</p>
          <input
            ref={fileInput}
            id="anki-file"
            type="file"
            accept=".apkg,.colpkg"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
          <button
            type="button"
            disabled={uploading !== null}
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 disabled:opacity-60"
          >
            {uploading !== null ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading !== null ? t('ankiImport.uploading', { percent: Math.round(uploading * 100) }) : t('ankiImport.choose')}
          </button>
          <p className="mt-3 text-xs text-text-muted">{t('ankiImport.limits')}</p>
        </div>
      )}

      {job && ACTIVE.has(job.status) && (
        <div className="lf-panel md:p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin text-accent-blue" />
            {job.status === 'analyzing' ? t('ankiImport.analyzing') : t('ankiImport.importing', { done: job.progress.done, total: job.progress.total })}
          </div>
          {job.status !== 'analyzing' && job.progress.total > 0 && (
            <div className="h-2 rounded-full bg-bg-surface overflow-hidden" role="progressbar" aria-valuenow={job.progress.done} aria-valuemax={job.progress.total}>
              <div className="h-full bg-accent-blue transition-all" style={{ width: `${(job.progress.done / job.progress.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {job?.status === 'staged' && job.preview && (
        <div className="lf-panel md:p-5 space-y-5">
          <div>
            <div className="text-sm font-medium">{job.filename}</div>
            <div className="text-xs text-text-muted">{t(`ankiImport.version.${job.preview.version}`)}</div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [t('ankiImport.count.notes'), job.preview.counts.notes],
              [t('ankiImport.count.cards'), job.preview.counts.cards],
              [t('ankiImport.count.reviews'), job.preview.counts.reviewLogEntries],
              [t('ankiImport.count.media'), `${job.preview.counts.media} · ${formatBytes(job.preview.counts.mediaBytes)}`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-bg-primary border border-border px-3 py-2">
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="text-lg font-medium tabular-nums">{typeof value === 'number' ? value.toLocaleString(i18n.language) : value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-text-muted">
            {t('ankiImport.states', { new: job.preview.counts.new, learning: job.preview.counts.learning, review: job.preview.counts.review, suspended: job.preview.counts.suspended })}
          </p>

          <section>
            <h2 className="text-sm font-medium mb-2">{t('ankiImport.decks')}</h2>
            <ul className="text-sm divide-y divide-border rounded-lg border border-border bg-bg-primary">
              {job.preview.decks.map(d => (
                <li key={d.path} className="flex justify-between px-3 py-1.5">
                  <span className="truncate">{d.path.split('::').join(' › ')}</span>
                  <span className="text-text-muted tabular-nums">{t('ankiImport.cardCount', { count: d.cards })}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-medium mb-2">{t('ankiImport.noteTypes')}</h2>
            <ul className="text-sm divide-y divide-border rounded-lg border border-border bg-bg-primary">
              {job.preview.noteTypes.map(nt => (
                <li key={nt.name} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="truncate flex-1">{nt.name}</span>
                  {nt.kind === 'cloze' && <span className="text-xs px-1.5 py-0.5 rounded bg-bg-surface">{t('ankiImport.cloze')}</span>}
                  {nt.known && <span className="text-xs px-1.5 py-0.5 rounded bg-bg-surface">{t('ankiImport.known')}</span>}
                  {!nt.supported && <span className="text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning">{t('ankiImport.unsupported')}</span>}
                  <span className="text-text-muted tabular-nums">{t('ankiImport.noteCount', { count: nt.notes })}</span>
                </li>
              ))}
            </ul>
            {job.preview.noteTypes.some(nt => !nt.supported) && (
              <p className="mt-2 text-xs text-text-muted">{t('ankiImport.unsupportedHint')}</p>
            )}
          </section>

          {job.preview.duplicates.total > 0 && (
            <p className="text-sm text-text-muted">
              {t('ankiImport.duplicates', { total: job.preview.duplicates.total, newer: job.preview.duplicates.newer })}
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">{t('ankiImport.schedule')}</legend>
            {(['keep', 'fresh'] as const).map(value => (
              <label key={value} htmlFor={`schedule-${value}`} className="flex items-start gap-2 text-sm cursor-pointer">
                <input id={`schedule-${value}`} type="radio" name="schedule" value={value} checked={schedule === value} onChange={() => setSchedule(value)} className="mt-1" />
                <span>
                  <span className="font-medium">{t(`ankiImport.scheduleOption.${value}`)}</span>
                  <span className="block text-xs text-text-muted">{t(`ankiImport.scheduleHint.${value}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void commit(job)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 disabled:opacity-60"
            >
              {t('ankiImport.start', { count: job.preview.counts.notes })}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void discard(job)}
              className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-bg-hover disabled:opacity-60"
            >
              {t('ankiImport.discard')}
            </button>
          </div>
        </div>
      )}

      {job?.status === 'done' && job.stats && (
        <div className="lf-panel md:p-5 space-y-4">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={18} className="text-accent-green" />
            {t('ankiImport.doneTitle')}
          </div>
          <ul className="text-sm space-y-1 text-text-muted">
            <li>{t('ankiImport.done.notes', { created: job.stats.notes.created, updated: job.stats.notes.updated, unchanged: job.stats.notes.unchanged })}</li>
            <li>{t('ankiImport.done.cards', { created: job.stats.cards.created, suspended: job.stats.cards.suspended })}</li>
            <li>{t('ankiImport.done.topics', { created: job.stats.topics.created, reused: job.stats.topics.reused })}</li>
            <li>{t('ankiImport.done.media', { stored: job.stats.media.stored, reused: job.stats.media.reused })}</li>
            {job.stats.cards.unsupported > 0 && <li>{t('ankiImport.done.unsupported', { count: job.stats.cards.unsupported })}</li>}
            {job.stats.media.overQuota > 0 && <li className="text-warning">{t('ankiImport.done.overQuota', { count: job.stats.media.overQuota })}</li>}
          </ul>
          {job.stats.notes.failed > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-warning">{t('ankiImport.done.failed', { count: job.stats.notes.failed })}</summary>
              <ul className="mt-2 space-y-1 text-xs text-text-muted">
                {job.stats.errors.map(e => <li key={e.guid}><code>{e.guid}</code> — {e.message}</li>)}
              </ul>
            </details>
          )}
          <p className="text-xs text-text-muted">{t('ankiImport.done.embeddings')}</p>
          <div className="flex gap-2">
            <Link to="/dashboard/topics" className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90">{t('ankiImport.toTopics')}</Link>
            <button type="button" onClick={() => open(null)} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-bg-hover">{t('ankiImport.another')}</button>
          </div>
        </div>
      )}

      {job?.status === 'failed' && (
        <div className="lf-panel md:p-5 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <XCircle size={18} className="text-danger" />
            {t('ankiImport.failedTitle')}
          </div>
          <p className="text-sm text-text-muted">{job.error}</p>
          <button type="button" onClick={() => void discard(job)} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-bg-hover">{t('ankiImport.another')}</button>
        </div>
      )}

      {history && history.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-2">{t('ankiImport.history')}</h2>
          <ul className="text-sm divide-y divide-border rounded-lg border border-border bg-bg-secondary">
            {history.map(h => (
              <li key={h.id}>
                <button type="button" onClick={() => open(h.id)} className="w-full flex justify-between gap-3 px-3 py-2 text-left hover:bg-bg-hover">
                  <span className="truncate">{h.filename}</span>
                  <span className="text-text-muted shrink-0">{t(`ankiImport.status.${h.status}`)} · {new Date(h.createdAt).toLocaleDateString(i18n.language)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
