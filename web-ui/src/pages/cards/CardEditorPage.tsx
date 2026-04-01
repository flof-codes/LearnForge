import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCard, useUpdateCard } from '../../hooks/useCards';
import CardEditor from './CardEditor';
import LoadingSpinner from '../../components/LoadingSpinner';
import SubscriptionBanner from '../../components/SubscriptionBanner';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import type { UpdateCardInput } from '../../types';

export default function CardEditorPage() {
  const { t } = useTranslation('app');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: card, isLoading } = useCard(id!);
  const updateCard = useUpdateCard();
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (!card) return <p className="text-text-muted">{t('cardDetail.notFound')}</p>;

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
        isPending={updateCard.isPending}
        onDirty={() => setError(null)}
      />
    </div>
  );
}
