import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shareService } from '../api/shares';

export const useShareLinks = () =>
  useQuery({ queryKey: ['shares'], queryFn: () => shareService.list().then(r => r.data) });

export const useCreateShareLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => shareService.create(topicId).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares'] }),
  });
};

export const useRevokeShareLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shareService.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares'] }),
  });
};

export const useSharePreview = (token: string | undefined) =>
  useQuery({
    queryKey: ['sharePreview', token],
    queryFn: () => shareService.preview(token!).then(r => r.data),
    enabled: !!token,
    retry: false,
  });

export const useAcceptShare = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => shareService.accept(token).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topics'] }),
  });
};
