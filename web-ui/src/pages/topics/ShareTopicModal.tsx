import { useEffect, useRef, useCallback, useState } from 'react';
import { X, Copy, Check, Trash2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from '../../hooks/useShares';

interface Props {
  open: boolean;
  topicId: string;
  topicName: string;
  onClose: () => void;
}

export default function ShareTopicModal({ open, topicId, topicName, onClose }: Props) {
  const { t } = useTranslation('app');
  const { data: allLinks } = useShareLinks();
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const activeLinks = (allLinks ?? []).filter(l => l.topic_id === topicId && !l.revoked_at);

  useEffect(() => {
    if (open) {
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

  const handleCopy = async (url: string, token: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // Clipboard API unavailable — ignore silently
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="bg-bg-secondary rounded-xl border border-border p-6 w-full max-w-lg mx-4"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="share-modal-title" className="font-medium text-lg">{t('shares.title', { name: topicName })}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-text-muted mb-4">{t('shares.description')}</p>

        {activeLinks.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {activeLinks.map(link => (
              <li key={link.id} className="flex items-center gap-2 bg-bg-surface rounded-lg p-2">
                <input
                  readOnly
                  value={link.url}
                  className="flex-1 bg-transparent text-sm text-text-primary outline-none font-mono"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => handleCopy(link.url, link.token)}
                  className="p-1.5 rounded hover:bg-bg-secondary text-text-muted hover:text-accent-blue transition-colors"
                  title={t('shares.copy')}
                >
                  {copiedToken === link.token ? <Check size={14} className="text-accent-green" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => revokeLink.mutate(link.id)}
                  disabled={revokeLink.isPending}
                  className="p-1.5 rounded hover:bg-bg-secondary text-text-muted hover:text-danger transition-colors"
                  title={t('shares.revoke')}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted mb-4 italic">{t('shares.noLinks')}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-bg-surface text-text-muted hover:text-text-primary transition-colors"
          >
            {t('shares.close')}
          </button>
          <button
            type="button"
            onClick={() => createLink.mutate(topicId)}
            disabled={createLink.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Plus size={14} />
            {createLink.isPending ? t('shares.creating') : t('shares.createLink')}
          </button>
        </div>
      </div>
    </div>
  );
}
