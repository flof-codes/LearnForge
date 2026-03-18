import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCreateCard } from '../../hooks/useCards';
import CardEditor from './CardEditor';
import type { CreateCardInput } from '../../types';

export default function CardCreatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const topicId = searchParams.get('topicId') ?? '';
  const createCard = useCreateCard();

  const handleSubmit = (data: CreateCardInput) => {
    createCard.mutate(data, {
      onSuccess: (card) => navigate(`/dashboard/cards/${card.id}`),
    });
  };

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
        <ArrowLeft size={16} /> Back
      </button>
      <h1 className="text-2xl font-medium">Create Card</h1>
      <CardEditor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialData={topicId ? { topicId } as any : undefined}
        onSubmit={data => handleSubmit(data as CreateCardInput)}
        isPending={createCard.isPending}
      />
    </div>
  );
}
