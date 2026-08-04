import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TopicSelector from '../../components/TopicSelector';
import { useTopicBreadcrumb } from '../../hooks/useTopics';

interface Props {
  open: boolean;
  excludeTopicIds: Set<string>;
  onSelect: (topicId: string, topicName: string) => void;
  onClose: () => void;
}

export default function AddFocusModal({ open, excludeTopicIds, onSelect, onClose }: Props) {
  const { t } = useTranslation('app');
  const [topicId, setTopicId] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { data: breadcrumb } = useTopicBreadcrumb(topicId || undefined);

  useEffect(() => {
    if (open) {
      setTopicId(''); // eslint-disable-line react-hooks/set-state-in-effect
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  const alreadyAdded = topicId && excludeTopicIds.has(topicId);
  const canAdd = !!topicId && !alreadyAdded;

  const handleAdd = () => {
    if (!canAdd) return;
    const name = breadcrumb && breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : topicId;
    onSelect(topicId, name);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="bg-bg-secondary rounded-xl border border-border p-5 w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">{t('focus.addTitle')}</h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="text-sm text-text-muted">{t('focus.pickTopic')}</label>
          <TopicSelector value={topicId} onChange={setTopicId} />

          {alreadyAdded && (
            <p className="text-xs text-warning">{t('focus.alreadyAdded')}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-muted hover:text-text-primary"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('focus.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
