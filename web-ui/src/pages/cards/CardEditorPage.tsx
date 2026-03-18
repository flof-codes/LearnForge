import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCard, useUpdateCard } from '../../hooks/useCards';
import CardEditor from './CardEditor';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { UpdateCardInput } from '../../types';

export default function CardEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: card, isLoading } = useCard(id!);
  const updateCard = useUpdateCard();

  if (isLoading) return <LoadingSpinner />;
  if (!card) return <p className="text-text-muted">Card not found.</p>;

  const handleSubmit = (data: UpdateCardInput) => {
    updateCard.mutate({ id: id!, data }, {
      onSuccess: () => navigate(`/dashboard/cards/${id}`),
    });
  };

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
        <ArrowLeft size={16} /> Back
      </button>
      <h1 className="text-2xl font-medium">Edit Card</h1>
      <CardEditor
        initialData={card}
        onSubmit={data => handleSubmit(data as UpdateCardInput)}
        isPending={updateCard.isPending}
      />
    </div>
  );
}
