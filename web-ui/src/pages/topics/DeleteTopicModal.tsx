import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmModal from '../../components/ConfirmModal';
import { useTopic } from '../../hooks/useTopics';

interface Props {
  topic: { id: string; name: string; cardCount: number } | null;
  pending: boolean;
  error: string | null;
  onConfirm: (withCards: boolean) => void;
  onCancel: () => void;
}

/** Plain confirm for an empty topic; with cards, lists what is lost and needs an explicit tick. */
export default function DeleteTopicModal({ topic, pending, error, onConfirm, onCancel }: Props) {
  const { t } = useTranslation('app');
  // Keyed by topic id so the tick never carries over to another topic
  const [understoodFor, setUnderstoodFor] = useState<string | null>(null);
  const hasCards = !!topic && topic.cardCount > 0;
  const { data: detail } = useTopic(hasCards ? topic.id : '');

  const errorLine = error && <p className="text-sm text-danger">{error}</p>;

  if (!topic || !hasCards) {
    return (
      <ConfirmModal
        open={!!topic}
        title={t('topics.deleteTitle')}
        message={t('topics.deleteMessage', { name: topic?.name })}
        confirmLabel={pending ? t('topics.deleting') : t('topics.deleteConfirm')}
        confirmDisabled={pending}
        danger
        onConfirm={() => onConfirm(false)}
        onCancel={onCancel}
      >
        {errorLine}
      </ConfirmModal>
    );
  }

  const understood = understoodFor === topic.id;
  const subtopics = detail?.children ?? [];

  return (
    <ConfirmModal
      open
      title={t('topics.deleteWithCardsTitle', { name: topic.name })}
      message={t('topics.deleteWithCardsMessage')}
      confirmLabel={pending ? t('topics.deleting') : t('topics.deleteTopicButton')}
      confirmDisabled={!understood || pending}
      danger
      onConfirm={() => onConfirm(true)}
      onCancel={onCancel}
    >
      <ul className="rounded-lg border border-border bg-bg-primary text-sm divide-y divide-border">
        <li className="flex justify-between gap-3 px-3 py-2">
          <span>{t('topics.deleteImpactCards')}</span>
          <span className="font-medium tabular-nums">{topic.cardCount}</span>
        </li>
        {subtopics.length > 0 && (
          <li className="flex justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              {t('topics.deleteImpactSubtopics')}
              <span className="block text-xs text-text-muted truncate">{subtopics.map(s => s.name).join(', ')}</span>
            </span>
            <span className="font-medium tabular-nums">{subtopics.length}</span>
          </li>
        )}
      </ul>
      <label htmlFor="delete-topic-understood" className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          id="delete-topic-understood"
          type="checkbox"
          checked={understood}
          disabled={pending}
          onChange={e => setUnderstoodFor(e.target.checked ? topic.id : null)}
          className="mt-1 accent-danger"
        />
        {t('topics.deleteUnderstand', { count: topic.cardCount })}
      </label>
      {errorLine}
    </ConfirmModal>
  );
}
