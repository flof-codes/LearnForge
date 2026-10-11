import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tutorService } from '../../api/tutor';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import type { TutorSettings } from '../../types';

const input = 'w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue';
const label = 'block text-sm text-text-muted mb-1';

/**
 * The account's own tutor setup: the Anthropic API key that pays for its
 * questions, the model that writes and grades them, and how much effort it
 * spends. The key is write-only: once saved, only its last four characters
 * come back.
 */
export default function TutorSettingsSection() {
  const { t } = useTranslation(['app']);
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; reason: string | null } | null>(null);

  const { data: settings } = useQuery({ queryKey: ['tutor', 'settings'], queryFn: () => tutorService.settings().then(r => r.data) });

  const applied = (saved: Omit<TutorSettings, 'models' | 'efforts'>) => {
    queryClient.setQueryData<TutorSettings>(['tutor', 'settings'], old => (old ? { ...old, ...saved } : old));
    // Whether the study view offers the tutor depends on the key.
    queryClient.invalidateQueries({ queryKey: ['tutor', 'status'] });
    setCheck(null);
  };
  const save = useMutation({
    mutationFn: (change: { api_key?: string; model?: string; effort?: string }) => tutorService.saveSettings(change).then(r => r.data),
    onSuccess: (saved) => { applied(saved); setNewKey(''); },
  });
  const remove = useMutation({ mutationFn: () => tutorService.removeKey().then(r => r.data), onSuccess: applied });
  const test = useMutation({ mutationFn: () => tutorService.checkKey().then(r => r.data), onSuccess: setCheck });

  if (!settings) return null;
  const model = settings.models.find(m => m.id === settings.model);
  const busy = save.isPending || remove.isPending;
  const failure = save.error ?? remove.error ?? test.error;

  return (
    <section className="lf-panel space-y-4">
      <div className="flex items-center gap-3">
        <Sparkles size={20} className="text-accent-blue" />
        <h2 className="text-lg font-medium text-text-primary">{t('app:settings.tutor.title')}</h2>
      </div>
      <p className="text-text-muted text-sm">{t('app:settings.tutor.description')}</p>

      {/* Key */}
      <div className="space-y-2">
        <label htmlFor="tutor-key" className={label}>{t('app:settings.tutor.key')}</label>
        {settings.hasKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-primary border border-border text-sm">
              <KeyRound size={14} className="text-text-muted" /> sk-ant-…{settings.keyHint}
            </code>
            <button onClick={() => test.mutate()} disabled={test.isPending || busy} className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-subtle-hover transition-colors disabled:opacity-50">
              {test.isPending ? t('app:settings.tutor.checking') : t('app:settings.tutor.check')}
            </button>
            <button onClick={() => remove.mutate()} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 text-sm text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-50">
              <Trash2 size={14} /> {t('app:settings.tutor.remove')}
            </button>
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t(settings.serverKey ? 'app:settings.tutor.serverKey' : 'app:settings.tutor.noKey')}</p>
        )}
        {check && (
          <p className={`flex items-center gap-1.5 text-sm ${check.ok ? 'text-accent-green' : 'text-danger'}`}>
            {check.ok ? <Check size={14} /> : <X size={14} />}
            {check.ok ? t('app:settings.tutor.checkOk') : t(`app:settings.tutor.checkFailed.${check.reason === 'auth' || check.reason === 'credits' ? check.reason : 'error'}`)}
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (newKey.trim()) save.mutate({ api_key: newKey.trim() }); }}
        >
          <input
            id="tutor-key"
            type="password"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder={t(settings.hasKey ? 'app:settings.tutor.replacePlaceholder' : 'app:settings.tutor.keyPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            className={`${input} flex-1 min-w-0 font-mono`}
          />
          <button type="submit" disabled={busy || newKey.trim() === ''} className="flex-none px-4 py-2 rounded-lg bg-accent-blue text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
            {t('app:settings.tutor.save')}
          </button>
        </form>
        <p className="text-xs text-text-muted">{t('app:settings.tutor.keyNote')}</p>
      </div>

      {/* Model and effort */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="tutor-model" className={label}>{t('app:settings.tutor.model')}</label>
          <select id="tutor-model" value={settings.model} disabled={busy} onChange={e => save.mutate({ model: e.target.value })} className={input}>
            {settings.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tutor-effort" className={label}>{t('app:settings.tutor.effort')}</label>
          <select id="tutor-effort" value={settings.effort} disabled={busy || !model?.effort} onChange={e => save.mutate({ effort: e.target.value })} className={`${input} disabled:opacity-50`}>
            {settings.efforts.map(e => <option key={e} value={e}>{t(`app:settings.tutor.efforts.${e}`)}</option>)}
          </select>
          {!model?.effort && <p className="text-xs text-text-muted mt-1">{t('app:settings.tutor.noEffort', { model: model?.name })}</p>}
        </div>
      </div>
      <p className="text-xs text-text-muted">{t('app:settings.tutor.modelNote')}</p>

      {failure && <p className="text-sm text-danger">{extractErrorMessage(failure)}</p>}
    </section>
  );
}
