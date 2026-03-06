import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useUpdateTopic, useTopics } from '../../hooks/useTopics';
import type { Topic } from '../../types';

interface Props {
  open: boolean;
  topic: Topic | null;
  onClose: () => void;
}

export default function EditTopicModal({ open, topic, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedParent, setSelectedParent] = useState('');
  const { data: topics } = useTopics();
  const updateTopic = useUpdateTopic();

  useEffect(() => {
    if (topic) {
      setName(topic.name); // eslint-disable-line react-hooks/set-state-in-effect
      setDescription(topic.description ?? '');
      setSelectedParent(topic.parentId ?? '');
    }
  }, [topic]);

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

  const allTopics = (topics ?? []).filter(t => t.id !== topic.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-secondary rounded-xl border border-border p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-lg">Edit Topic</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue resize-none"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Parent Topic</label>
            <select
              value={selectedParent}
              onChange={e => setSelectedParent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
            >
              <option value="">None (root topic)</option>
              {allTopics.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-bg-surface text-text-muted hover:text-text-primary transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || updateTopic.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {updateTopic.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
