import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tutorService } from '../../api/tutor';
import SheetFrame from './SheetFrame';
import { barButton, primaryButton } from './buttons';
import { tutorErrorKey } from '../../utils/tutor';
import type { FeedbackLabel, TutorRewrite } from '../../types';

const LABELS: FeedbackLabel[] = ['unclear', 'not_my_way', 'too_easy', 'too_detailed', 'wrong_answer', 'gives_away'];

interface Props {
  questionId: string;
  onClose: () => void;
  /** The tutor wrote a new version: the session shows it in place of this one. */
  onRewritten: (rewrite: TutorRewrite, labels: FeedbackLabel[]) => void;
}

/** Feedback on a question: preset labels and a note, then the tutor rewrites it right away. */
export default function FeedbackSheet({ questionId, onClose, onRewritten }: Props) {
  const { t } = useTranslation('app');
  const [labels, setLabels] = useState<FeedbackLabel[]>([]);
  const [note, setNote] = useState('');
  const [scope, setScope] = useState<'question' | 'card'>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The feedback is stored, only the rewrite failed: sending again would store it twice. */
  const [kept, setKept] = useState(false);

  const toggle = (l: FeedbackLabel) => setLabels(ls => (ls.includes(l) ? ls.filter(x => x !== l) : [...ls, l]));
  const ready = labels.length > 0 || note.trim() !== '';

  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await tutorService.feedback({ questionId, labels, note: note.trim(), scope });
      onRewritten(data, labels);
    } catch (err) {
      // A model fault (503) comes after the feedback was stored: it still guides the next question.
      const stored = (err as { response?: { status?: number } }).response?.status === 503;
      setKept(stored);
      setError(stored ? t('tutor.help.feedbackKept') : t(tutorErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const seg = (on: boolean) => `flex-1 py-2 px-2 text-[13px] transition-colors ${on ? 'bg-bg-surface font-semibold text-text-primary' : 'text-text-muted'}`;

  return (
    <SheetFrame title={t('tutor.help.feedbackTitle')} closeLabel={t('tutor.help.close')} onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {LABELS.map(l => (
          <button
            key={l}
            type="button"
            aria-pressed={labels.includes(l)}
            onClick={() => toggle(l)}
            className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${labels.includes(l) ? 'border-accent-blue text-accent-blue bg-accent-blue/10' : 'border-border hover:bg-bg-hover'}`}
          >
            {t(`tutor.help.labels.${l}`)}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder={t('tutor.help.note')}
        aria-label={t('tutor.help.note')}
        className="w-full resize-y px-3 py-2.5 rounded-lg bg-bg-secondary border border-border text-text-primary focus:outline-none focus:border-accent-blue"
      />
      <div className="space-y-1.5">
        <div className="text-[13px] text-text-muted">{t('tutor.help.appliesTo')}</div>
        <div className="flex rounded-lg border border-border overflow-hidden" role="group" aria-label={t('tutor.help.appliesTo')}>
          <button type="button" aria-pressed={scope === 'question'} onClick={() => setScope('question')} className={seg(scope === 'question')}>{t('tutor.help.scopeQuestion')}</button>
          <button type="button" aria-pressed={scope === 'card'} onClick={() => setScope('card')} className={`${seg(scope === 'card')} border-l border-border`}>{t('tutor.help.scopeCard')}</button>
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {kept ? (
        <button type="button" onClick={onClose} className={`${barButton} w-full`}>{t('tutor.help.backToQuestion')}</button>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={barButton}>{t('tutor.menu.cancel')}</button>
          <button type="button" onClick={send} disabled={!ready || busy} className={primaryButton}>
            {busy ? t('tutor.help.rewriting') : t('tutor.help.rewrite')}
          </button>
        </div>
      )}
    </SheetFrame>
  );
}
