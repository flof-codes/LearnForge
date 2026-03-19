import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCreateTopic, useTopics } from '../../hooks/useTopics';
import type { Topic } from '../../types';

interface Props {
  open: boolean;
  parentId?: string;
  onClose: () => void;
}

export default function CreateTopicModal({ open, parentId, onClose }: Props) {
  const { t } = useTranslation('app');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedParent, setSelectedParent] = useState(parentId ?? '');
  const { data: topics } = useTopics();
  const createTopic = useCreateTopic();

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createTopic.mutate(
      { name: name.trim(), description: description.trim() || undefined, parentId: selectedParent || undefined },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setSelectedParent('');
          onClose();
        },
      }
    );
  };

  const allTopics: Topic[] = topics ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-secondary rounded-xl border border-border p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-lg">{t('topics.createTitle')}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">{t('topics.name')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              placeholder={t('topics.namePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t('topics.descriptionOptional')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue resize-none"
              rows={2}
              placeholder={t('topics.descriptionPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t('topics.parentTopic')}</label>
            <select
              value={selectedParent}
              onChange={e => setSelectedParent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
            >
              <option value="">{t('topics.noneRoot')}</option>
              {allTopics.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-bg-surface text-text-muted hover:text-text-primary transition-colors">
              {t('topics.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createTopic.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createTopic.isPending ? t('topics.creating') : t('topics.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
