import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardHtmlRender from '../../components/CardHtmlRender';
import { useIsPhone } from '../../hooks/useIsPhone';
import DifficultyPicker from './DifficultyPicker';
import SheetFrame from './SheetFrame';
import { presetOf } from '../../utils/tutor';

interface Props {
  difficulty: number;
  /** Resolves once the session runs at the new difficulty. */
  onChangeDifficulty: (difficulty: number) => Promise<void>;
  /** The card behind the question. Left out where the card itself is on screen. */
  card?: { frontHtml: string; backHtml: string };
  /** The back gives the answer away, so it opens only once the question is answered. */
  answered?: boolean;
  onViewDetail?: () => void;
  /** Lets the card stop its own keyboard shortcuts while something is open. */
  onOpenChange?: (open: boolean) => void;
  /** Where the session stands, shown at the top of the menu: the card's full folder path and the count. */
  info?: { path: string; progress: string };
  /** Opens the feedback sheet of a written question. */
  onFeedback?: () => void;
}

type Sheet = 'difficulty' | 'card' | null;

/**
 * The "…" at the top right of a study card: where the session stands, change
 * its difficulty, look at the original card, open the card's details, give
 * feedback on the question.
 */
export default function CardMenu({ difficulty, onChangeDifficulty, card, answered, onViewDetail, onOpenChange, info, onFeedback }: Props) {
  const { t } = useTranslation('app');
  const isPhone = useIsPhone();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [draft, setDraft] = useState(difficulty);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const anyOpen = menu || sheet !== null;
  useEffect(() => { onOpenChange?.(anyOpen); }, [anyOpen, onOpenChange]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);

  const name = (d: number) => {
    const preset = presetOf(d);
    return preset ? t(`tutor.headspace.${preset}`) : t('tutor.headspace.custom', { value: d.toFixed(2) });
  };
  const open = (which: Exclude<Sheet, null>) => {
    setMenu(false);
    setDraft(difficulty);
    setSide('front');
    setSheet(which);
  };
  const apply = async () => {
    setSaving(true);
    try {
      await onChangeDifficulty(draft);
      setSheet(null);
    } finally {
      setSaving(false);
    }
  };
  const changed = Math.abs(draft - difficulty) > 0.001;
  const item = 'flex items-center justify-between gap-4 w-full text-left text-[15px] px-3 py-2 rounded-md hover:bg-bg-surface transition-colors';
  const shownSide = answered ? side : 'front';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setMenu(m => !m)}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={t('tutor.menu.more')}
        title={t('tutor.menu.more')}
        className={`grid place-items-center w-9 h-8 rounded-lg transition-colors ${menu ? 'bg-bg-surface text-text-primary' : 'text-text-muted hover:bg-bg-surface hover:text-text-primary'}`}
      >
        <MoreHorizontal size={20} />
      </button>

      {menu && (
        <div role="menu" className="absolute right-0 top-9 z-30 min-w-56 max-w-[min(20rem,calc(100vw-2rem))] p-1 rounded-lg border border-border bg-bg-primary shadow-lg normal-case tracking-normal text-text-primary">
          {info && (
            <div className="px-3 pt-1.5 pb-2 mb-1 border-b border-border text-[13px] leading-snug">
              <div className="text-text-primary">{info.path}</div>
              <div className="text-text-muted tabular-nums">{info.progress}</div>
            </div>
          )}
          <button type="button" role="menuitem" className={item} onClick={() => open('difficulty')}>
            {t('tutor.menu.difficulty')} <span className="text-sm text-text-muted">{name(difficulty)}</span>
          </button>
          {card && <button type="button" role="menuitem" className={item} onClick={() => open('card')}>{t('tutor.menu.card')}</button>}
          {onViewDetail && <button type="button" role="menuitem" className={item} onClick={() => { setMenu(false); onViewDetail(); }}>{t('tutor.menu.details')}</button>}
          {onFeedback && (
            <button type="button" role="menuitem" className={`${item} mt-1 border-t border-border rounded-t-none`} onClick={() => { setMenu(false); onFeedback(); }}>
              {t('tutor.menu.feedback')}
            </button>
          )}
        </div>
      )}

      {sheet === 'difficulty' && (
        <SheetFrame title={t('tutor.menu.difficultyTitle')} onClose={() => setSheet(null)}>
          <DifficultyPicker value={draft} onChange={setDraft} />
          <p className="text-sm text-text-muted">
            {t('tutor.menu.nextCard')}{' '}
            {changed ? t('tutor.menu.rewrite') : t('tutor.menu.runsAt', { name: name(difficulty) })}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSheet(null)} className="flex-1 py-3 rounded-lg text-sm font-medium border border-border bg-bg-surface hover:bg-bg-hover transition-colors">{t('tutor.menu.cancel')}</button>
            <button type="button" onClick={apply} disabled={!changed || saving} className="flex-1 py-3 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50">
              {t('tutor.menu.use', { name: name(draft) })}
            </button>
          </div>
        </SheetFrame>
      )}

      {sheet === 'card' && card && (
        <SheetFrame title={t('tutor.menu.card')} onClose={() => setSheet(null)}>
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(['front', 'back'] as const).map(s => (
              <button
                key={s}
                type="button"
                aria-pressed={shownSide === s}
                disabled={s === 'back' && !answered}
                onClick={() => setSide(s)}
                className={`flex-1 py-1.5 transition-colors disabled:opacity-50 ${shownSide === s ? 'bg-bg-surface font-semibold text-text-primary' : 'text-text-muted'}`}
              >
                {t(`study.${s}`)}
              </button>
            ))}
          </div>
          {!answered && <p className="text-sm text-text-muted">{t('tutor.menu.backLocked')}</p>}
          <CardHtmlRender key={shownSide} html={shownSide === 'front' ? card.frontHtml : card.backHtml} interactive flat={isPhone} />
        </SheetFrame>
      )}
    </div>
  );
}
