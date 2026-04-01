import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUpdateTopic } from '../../hooks/useTopics';
import TopicSelector from '../../components/TopicSelector';
import type { Topic } from '../../types';

interface Props {
  open: boolean;
  topic: Topic | null;
  onClose: () => void;
}

export default function EditTopicModal({ open, topic, onClose }: Props) {
  const { t } = useTranslation('app');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedParent, setSelectedParent] = useState('');
  const updateTopic = useUpdateTopic();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (topic) {
      setName(topic.name); // eslint-disable-line react-hooks/set-state-in-effect
      setDescription(topic.description ?? '');
      setSelectedParent(topic.parentId ?? '');
    }
  }, [topic]);

  // Save focus on open, restore on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  // Escape key closes modal
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

  // Focus trap
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

  if (!open || !topic) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateTopic.mutate(
      {
        id: topic.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          parentId: selectedParent || undefined,
        },
      },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-topic-modal-title"
        className="bg-bg-secondary rounded-xl border border-border p-6 w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="edit-topic-modal-title" className="font-medium text-lg">{t('topics.editTitle')}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-topic-name" className="block text-sm text-text-muted mb-1">{t('topics.name')}</label>
            <input
              id="edit-topic-name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="edit-topic-description" className="block text-sm text-text-muted mb-1">{t('topics.description')}</label>
            <textarea
              id="edit-topic-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue resize-none"
              rows={2}
            />
          </div>
          <label className="block">
            <span className="block text-sm text-text-muted mb-1">{t('topics.parentTopic')}</span>
            <TopicSelector value={selectedParent} onChange={setSelectedParent} excludeId={topic.id} allowNone />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-bg-surface text-text-muted hover:text-text-primary transition-colors">
              {t('topics.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || updateTopic.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {updateTopic.isPending ? t('topics.saving') : t('topics.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
