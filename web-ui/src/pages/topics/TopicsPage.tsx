import { useState } from 'react';
import { Plus, FolderTree } from 'lucide-react';
import { useTopics, useDeleteTopic } from '../../hooks/useTopics';
import TopicTreeNode from './TopicTreeNode';
import CreateTopicModal from './CreateTopicModal';
import EditTopicModal from './EditTopicModal';
import ConfirmModal from '../../components/ConfirmModal';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Topic } from '../../types';

export default function TopicsPage() {
  const { data: topics, isLoading } = useTopics();
  const deleteTopic = useDeleteTopic();

  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [editTopic, setEditTopic] = useState<Topic | null>(null);
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null);

  const handleCreate = (parentId?: string) => {
    setCreateParentId(parentId);
    setCreateOpen(true);
  };

  const handleDelete = () => {
    if (!deletingTopic) return;
    deleteTopic.mutate(deletingTopic.id, { onSuccess: () => setDeletingTopic(null) });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Topics</h1>
        <button
          onClick={() => handleCreate()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          New Topic
        </button>
      </div>

      <div className="bg-bg-secondary rounded-xl border border-border p-3">
        {topics && topics.length > 0 ? (
          topics.map(topic => (
            <TopicTreeNode
              key={topic.id}
              topic={topic}
              onEdit={setEditTopic}
              onDelete={setDeletingTopic}
              onCreate={handleCreate}
            />
          ))
        ) : (
          <div className="text-center py-12 text-text-muted">
            <FolderTree size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No topics yet. Create one to get started.</p>
          </div>
        )}
      </div>

      <CreateTopicModal
        open={createOpen}
        parentId={createParentId}
        onClose={() => { setCreateOpen(false); setCreateParentId(undefined); }}
      />
      <EditTopicModal
        open={!!editTopic}
        topic={editTopic}
        onClose={() => setEditTopic(null)}
      />
      <ConfirmModal
        open={!!deletingTopic}
        title="Delete Topic"
        message={`Delete "${deletingTopic?.name}"? Child topics will become root topics.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeletingTopic(null)}
      />
    </div>
  );
}
