import { createPortal } from 'react-dom';
import { BookOpen, Check, TextQuote, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TextSelection } from '../../hooks/useTextSelection';
import type { Lookup } from './useStudyHelp';

interface SelectionProps {
  selection: TextSelection;
  onDefine: () => void;
  onTutorial: () => void;
}

// Buttons keep the selection alive: a mousedown would otherwise collapse it before the click.
const keep = (e: React.MouseEvent) => e.preventDefault();

/** Desktop: Define and Tutorial right above the selected words. */
export function SelectionPopover({ selection, onDefine, onTutorial }: SelectionProps) {
  const { t } = useTranslation('app');
  const { rect } = selection;
  const left = Math.min(window.innerWidth - 110, Math.max(110, rect.left + rect.width / 2));
  return createPortal(
    <div
      role="toolbar"
      aria-label={t('tutor.help.selection')}
      style={{ left, top: Math.max(8, rect.top - 46) }}
      className="fixed z-40 -translate-x-1/2 flex gap-0.5 p-[3px] rounded-lg bg-text-primary text-bg-primary shadow-lg text-sm font-medium"
    >
      <button type="button" onMouseDown={keep} onClick={onDefine} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-bg-primary/15">
        <TextQuote size={14} /> {t('tutor.help.define')}
      </button>
      <button type="button" onMouseDown={keep} onClick={onTutorial} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-bg-primary/15">
        <BookOpen size={14} /> {t('tutor.help.tutorial')}
      </button>
    </div>,
    document.body,
  );
}

/** Phone: the same two actions docked above the bottom bar, clear of the system's own selection menu. */
export function SelectionBar({ selection, onDefine, onTutorial }: SelectionProps) {
  const { t } = useTranslation('app');
  return (
    <div role="toolbar" aria-label={t('tutor.help.selection')} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg bg-text-primary text-bg-primary text-sm">
      <span className="flex-1 min-w-0 truncate opacity-85">“{selection.text}”</span>
      <button type="button" onMouseDown={keep} onClick={onDefine} className="px-2.5 py-1.5 rounded-md font-semibold bg-bg-primary/15">{t('tutor.help.define')}</button>
      <button type="button" onMouseDown={keep} onClick={onTutorial} className="px-2.5 py-1.5 rounded-md font-semibold bg-bg-primary/15">{t('tutor.help.tutorial')}</button>
    </div>
  );
}

interface DefinitionProps {
  lookup: Lookup;
  onSave: () => void;
  onTutorial: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** A generated definition, laid out like the explanation of a stored term. */
export function DefinitionBox({ lookup, onSave, onTutorial, onRetry, onClose }: DefinitionProps) {
  const { t } = useTranslation('app');
  const action = 'text-accent-blue font-medium hover:underline';
  const quiet = 'text-text-muted hover:text-text-primary';
  return (
    <div className={`pl-3 border-l-2 text-sm leading-normal space-y-2 ${lookup.status === 'error' ? 'border-danger' : 'border-accent-purple'}`} aria-live="polite">
      {lookup.status === 'loading' ? (
        <div className="space-y-1.5" aria-busy="true">
          <b className="font-semibold">{lookup.term}</b>
          <div className="h-3 w-11/12 rounded bg-bg-surface animate-pulse" />
          <div className="h-3 w-7/12 rounded bg-bg-surface animate-pulse" />
          <p className="text-text-muted">{t('tutor.help.writingDefinition')}</p>
        </div>
      ) : lookup.status === 'error' && !lookup.definition ? (
        <>
          <p><b className="font-semibold">{lookup.term}.</b> <span className="text-danger">{lookup.error}</span></p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={onRetry} className={action}>{t('tutor.retry')}</button>
            <button type="button" onClick={onClose} className={quiet}>{t('tutor.help.close')}</button>
          </div>
        </>
      ) : (
        <>
          <p><b className="font-semibold">{lookup.term}.</b> {lookup.definition}</p>
          {lookup.error && <p className="text-danger">{lookup.error}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {lookup.status === 'saved' ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-purple"><Check size={12} /> {t('tutor.help.savedToCard')}</span>
            ) : (
              <>
                <span className="text-[11px] font-semibold px-1.5 rounded-full bg-accent-purple/15 text-accent-purple">{t('tutor.help.new')}</span>
                <button type="button" onClick={onSave} className={action}>{t('tutor.help.saveToCard')}</button>
              </>
            )}
            <button type="button" onClick={onTutorial} className={action}>{t('tutor.help.tutorial')}</button>
            <button type="button" onClick={onClose} className={quiet}>{t('tutor.help.close')}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Above a rewritten question: what it was rewritten from, and the way back. */
export function RewriteNote({ labels, onUndo, busy }: { labels: string[]; onUndo: () => void; busy?: boolean }) {
  const { t } = useTranslation('app');
  return (
    <div className="flex items-center gap-2 text-[13px] text-accent-green">
      <Check size={14} className="shrink-0" />
      <span className="min-w-0">
        {t('tutor.help.rewritten')}
        {labels.length > 0 && <span className="text-text-muted"> · {labels.map(l => t(`tutor.help.labels.${l}`)).join(', ')}</span>}
      </span>
      <button type="button" onClick={onUndo} disabled={busy} className="ml-auto shrink-0 inline-flex items-center gap-1 text-accent-blue disabled:opacity-50">
        <Undo2 size={14} /> {t('tutor.help.undo')}
      </button>
    </div>
  );
}
