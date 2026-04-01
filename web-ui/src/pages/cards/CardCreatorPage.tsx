import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCreateCard } from '../../hooks/useCards';
import CardEditor from './CardEditor';
import SubscriptionBanner from '../../components/SubscriptionBanner';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import type { CreateCardInput } from '../../types';

export default function CardCreatorPage() {
  const { t } = useTranslation('app');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const topicId = searchParams.get('topicId') ?? '';
  const createCard = useCreateCard();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (data: CreateCardInput) => {
    setError(null);
    createCard.mutate(data, {
      onSuccess: (card) => navigate(`/dashboard/cards/${card.id}`),
      onError: (err) => setError(extractErrorMessage(err) || t('errors.createCardFailed')),
    });
  };

  return (
    <div className="space-y-4">
      <SubscriptionBanner />
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>
      <h1 className="text-2xl font-medium">{t('cardEditor.createTitle')}</h1>
      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-danger/15 text-danger">
          {error}
        </div>
      )}
      <CardEditor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData={topicId ? { topicId } as any : undefined}
        onSubmit={data => handleSubmit(data as CreateCardInput)}
        isPending={createCard.isPending}
        onDirty={() => setError(null)}
      />
    </div>
  );
}
