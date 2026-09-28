import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCard, useUpdateCard } from '../../hooks/useCards';
import CardEditor from './CardEditor';
import LoadingSpinner from '../../components/LoadingSpinner';
import SubscriptionBanner from '../../components/SubscriptionBanner';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import type { UpdateCardInput, UpdateNoteInput } from '../../types';
import { noteService } from '../../api/notes';
import { useQueryClient } from '@tanstack/react-query';

export default function CardEditorPage() {
  const { t } = useTranslation('app');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: card, isLoading } = useCard(id!);
  const updateCard = useUpdateCard();
  const queryClient = useQueryClient();
  const [notePending, setNotePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (!card) return <p className="text-text-muted">{t('cardDetail.notFound')}</p>;

  const handleSubmitNote = async (data: UpdateNoteInput, changeRate: number | null) => {
    if (!card?.noteId) return;
    setError(null);
    setNotePending(true);
    try {
      await noteService.update(card.noteId, data);
      // The variation slider belongs to the card, not the note.
      if (changeRate !== (card.changeRate ?? null)) {
        await updateCard.mutateAsync({ id: id!, data: { change_rate: changeRate } });
      }
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
      navigate(`/dashboard/cards/${id}`);
    } catch (err) {
      setError(extractErrorMessage(err) || t('errors.updateCardFailed'));
    } finally {
      setNotePending(false);
    }
  };

  const handleSubmit = (data: UpdateCardInput) => {
    setError(null);
    updateCard.mutate({ id: id!, data }, {
      onSuccess: () => navigate(`/dashboard/cards/${id}`),
      onError: (err) => setError(extractErrorMessage(err) || t('errors.updateCardFailed')),
    });
  };

  return (
    <div className="space-y-4">
      <SubscriptionBanner />
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>
      <h1 className="text-2xl font-medium">{t('cardEditor.editTitle')}</h1>
      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-danger/15 text-danger">
          {error}
        </div>
      )}
      <CardEditor
        initialData={card}
        onSubmit={data => handleSubmit(data as UpdateCardInput)}
        onSubmitNote={handleSubmitNote}
        isPending={updateCard.isPending || notePending}
        onDirty={() => setError(null)}
      />
    </div>
  );
}
