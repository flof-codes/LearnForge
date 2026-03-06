import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardService } from '../api/cards';
import type { CreateCardInput, UpdateCardInput } from '../types';

export const useCard = (id: string) =>
  useQuery({ queryKey: ['cards', id], queryFn: () => cardService.get(id).then(r => r.data), enabled: !!id });

export const useCreateCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCardInput) => cardService.create(data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: ['topics'] });
      qc.invalidateQueries({ queryKey: ['study'] });
    },
  });
};

export const useUpdateCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCardInput }) => cardService.update(id, data).then(r => r.data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['cards', id] });
      qc.invalidateQueries({ queryKey: ['topics'] });
    },
  });
};

export const useResetCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cardService.reset(id).then(r => r.data),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['cards', id] });
      qc.invalidateQueries({ queryKey: ['study'] });
    },
  });
};

export const useDeleteCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cardService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: ['topics'] });
      qc.invalidateQueries({ queryKey: ['study'] });
    },
  });
};
