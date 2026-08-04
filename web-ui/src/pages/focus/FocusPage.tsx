import { useState, useMemo, useEffect } from 'react';
import { Star, Plus, Trash2, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusTopics, useSetFocusTopics, useClearFocusTopics } from '../../hooks/useFocus';
import { useNow } from '../../hooks/useNow';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorFallback from '../../components/ErrorFallback';
import AddFocusModal from './AddFocusModal';
import type { FocusTopic, FocusTopicInput } from '../../types';

type ExpiryPreset = 'indefinite' | '1h' | '4h' | '1d' | '3d' | '1w';

const EXPIRY_PRESETS: { value: ExpiryPreset; labelKey: string }[] = [
  { value: 'indefinite', labelKey: 'focus.expiryIndefinite' },
  { value: '1h', labelKey: 'focus.expiry1h' },
  { value: '4h', labelKey: 'focus.expiry4h' },
  { value: '1d', labelKey: 'focus.expiry1d' },
  { value: '3d', labelKey: 'focus.expiry3d' },
  { value: '1w', labelKey: 'focus.expiry1w' },
];

function presetToIso(preset: ExpiryPreset): string | null {
  if (preset === 'indefinite') return null;
  const now = Date.now();
  const map: Record<Exclude<ExpiryPreset, 'indefinite'>, number> = {
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
  };
  return new Date(now + map[preset]).toISOString();
}

function formatExpiry(iso: string | null, now: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!iso) return t('focus.indefinite');
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return t('focus.expired');
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t('focus.expiresInMinutes', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('focus.expiresInHours', { count: hours });
  const days = Math.round(hours / 24);
  return t('focus.expiresInDays', { count: days });
}

export default function FocusPage() {
  const { t } = useTranslation('app');
  const { data: focusList, isLoading, isError, error, refetch } = useFocusTopics();
  const setFocus = useSetFocusTopics();
  const clearFocus = useClearFocusTopics();
  const [addOpen, setAddOpen] = useState(false);
  const [localList, setLocalList] = useState<FocusTopic[]>([]);
  const now = useNow();

  useEffect(() => {
    if (focusList) setLocalList(focusList); // eslint-disable-line react-hooks/set-state-in-effect
  }, [focusList]);

  const dirty = useMemo(() => {
    if (!focusList) return false;
    if (focusList.length !== localList.length) return true;
    return focusList.some((f, i) => {
      const l = localList[i];
      return f.topic_id !== l.topic_id || f.expires_at !== l.expires_at;
    });
  }, [focusList, localList]);

  const existingTopicIds = useMemo(() => new Set(localList.map((f) => f.topic_id)), [localList]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorFallback message={(error as Error).message} onReset={() => refetch()} />;

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= localList.length) return;
    const next = [...localList];
    [next[idx], next[target]] = [next[target], next[idx]];
    setLocalList(next.map((f, i) => ({ ...f, priority: i + 1 })));
  };

  const handleRemove = (idx: number) => {
    setLocalList(localList.filter((_, i) => i !== idx).map((f, i) => ({ ...f, priority: i + 1 })));
  };

  const handleSetExpiry = (idx: number, preset: ExpiryPreset) => {
    const next = [...localList];
    next[idx] = { ...next[idx], expires_at: presetToIso(preset) };
    setLocalList(next);
  };

  const handleAdd = (topicId: string, topicName: string) => {
    if (existingTopicIds.has(topicId)) return;
    const newEntry: FocusTopic = {
      id: `tmp-${topicId}`,
      topic_id: topicId,
      topic_name: topicName,
      priority: localList.length + 1,
      expires_at: null,
      created_at: new Date().toISOString(),
    };
    setLocalList([...localList, newEntry]);
    setAddOpen(false);
  };

  const handleSave = () => {
    const input: FocusTopicInput[] = localList.map((f) => ({
      topic_id: f.topic_id,
      expires_at: f.expires_at,
    }));
    setFocus.mutate(input);
  };

  const handleClearAll = () => {
    if (localList.length === 0) return;
    clearFocus.mutate(undefined, {
      onSuccess: () => setLocalList([]),
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-medium flex items-center gap-2">
            <Star size={22} className="text-warning fill-warning" />
            {t('focus.title')}
          </h1>
          <p className="text-sm text-text-muted mt-1">{t('focus.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={setFocus.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('focus.save')}
            </button>
          )}
          {localList.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearFocus.isPending}
              className="px-3 py-2 rounded-lg text-sm font-medium border border-border text-text-muted hover:text-danger hover:border-danger transition-colors disabled:opacity-50"
            >
              {t('focus.clearAll')}
            </button>
          )}
        </div>
      </div>

      <div className="bg-bg-secondary rounded-xl border border-border p-3 space-y-2">
        {localList.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <Star size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm mb-1">{t('focus.empty')}</p>
            <p className="text-xs">{t('focus.emptyHint')}</p>
          </div>
        ) : (
          localList.map((f, idx) => {
            const expired = !!(f.expires_at && new Date(f.expires_at).getTime() <= now);
            return (
              <div
                key={f.id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg border ${
                  expired ? 'border-danger/30 bg-danger/5' : 'border-border bg-bg-surface'
                }`}
              >
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-warning/20 text-warning font-medium text-sm shrink-0">
                  {f.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{f.topic_name}</div>
                  <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
                    <Clock size={11} />
                    <span className={expired ? 'text-danger' : ''}>{formatExpiry(f.expires_at, now, t)}</span>
                  </div>
                </div>

                <select
                  value={isoToPreset(f.expires_at, now)}
                  onChange={(e) => handleSetExpiry(idx, e.target.value as ExpiryPreset)}
                  className="text-xs bg-bg-primary border border-border rounded px-2 py-1.5 text-text-primary"
                  aria-label={t('focus.changeExpiry')}
                >
                  {EXPIRY_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(p.labelKey)}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('focus.moveUp')}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === localList.length - 1}
                    className="p-1.5 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('focus.moveDown')}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    onClick={() => handleRemove(idx)}
                    className="p-1.5 text-text-muted hover:text-danger"
                    title={t('focus.remove')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}

        <button
          onClick={() => setAddOpen(true)}
          disabled={localList.length >= 20}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border text-sm text-text-muted hover:text-text-primary hover:border-text-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
          {t('focus.addTopic')}
          {localList.length >= 20 && (
            <span className="text-xs">({t('focus.maxReached')})</span>
          )}
        </button>
      </div>

      {setFocus.isError && (
        <p className="text-sm text-danger">{(setFocus.error as Error).message}</p>
      )}

      <AddFocusModal
        open={addOpen}
        excludeTopicIds={existingTopicIds}
        onSelect={handleAdd}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}

function isoToPreset(iso: string | null, now: number): ExpiryPreset {
  if (!iso) return 'indefinite';
  const ms = new Date(iso).getTime() - now;
  const hours = ms / 3_600_000;
  if (hours <= 1.5) return '1h';
  if (hours <= 6) return '4h';
  if (hours <= 36) return '1d';
  if (hours <= 96) return '3d';
  return '1w';
}

