import { useState } from 'react';
import { Plus, FolderTree, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTopics, useDeleteTopic } from '../../hooks/useTopics';
import TopicTreeNode from './TopicTreeNode';
import CreateTopicModal from './CreateTopicModal';
import EditTopicModal from './EditTopicModal';
import DeleteTopicModal from './DeleteTopicModal';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorFallback from '../../components/ErrorFallback';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import type { Topic } from '../../types';

export default function TopicsPage() {
  const { t } = useTranslation('app');
  const { data: topics, isLoading, isError, error, refetch } = useTopics();
  const deleteTopic = useDeleteTopic();

  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [editTopic, setEditTopic] = useState<Topic | null>(null);
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCreate = (parentId?: string) => {
    setCreateParentId(parentId);
    setCreateOpen(true);
  };

  const openDelete = (topic: Topic) => {
    setDeleteError(null);
    setDeletingTopic(topic);
  };

  const handleDelete = (withCards: boolean) => {
    if (!deletingTopic) return;
    setDeleteError(null);
    deleteTopic.mutate({ id: deletingTopic.id, withCards }, {
      onSuccess: () => setDeletingTopic(null),
      onError: (err) => setDeleteError(extractErrorMessage(err) || t('errors.deleteTopicFailed')),
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorFallback message={(error as Error).message} onReset={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-medium">{t('topics.title')}</h1>
        {/* Short labels on a phone, so the buttons stay on one line next to the title */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/dashboard/import/anki"
            title={t('topics.importAnki')}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm whitespace-nowrap border border-border hover:bg-bg-hover transition-colors"
          >
            <Upload size={16} />
            <span className="md:hidden">{t('topics.importShort')}</span>
            <span className="hidden md:inline">{t('topics.importAnki')}</span>
          </Link>
          <button
            onClick={() => handleCreate()}
            title={t('topics.newTopic')}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap bg-accent-blue text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            <span className="md:hidden">{t('topics.newShort')}</span>
            <span className="hidden md:inline">{t('topics.newTopic')}</span>
          </button>
        </div>
      </div>

      {/* Phone: rows run edge to edge and carry their own hairline, so the panel drops its padding and bottom border */}
      <div className="lf-panel p-0 max-md:border-b-0 md:p-3">
        {topics && topics.length > 0 ? (
          topics.map(topic => (
            <TopicTreeNode
              key={topic.id}
              topic={topic}
              onEdit={setEditTopic}
              onDelete={openDelete}
              onCreate={handleCreate}
            />
          ))
        ) : (
          <div className="text-center py-12 text-text-muted">
            <FolderTree size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t('topics.noTopicsYet')}</p>
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
      <DeleteTopicModal
        topic={deletingTopic}
        pending={deleteTopic.isPending}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setDeletingTopic(null)}
      />
    </div>
  );
}
