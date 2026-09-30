import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { topicService } from '../api/topics';
import type { CreateTopicInput, UpdateTopicInput } from '../types';

export const useTopics = () =>
  useQuery({ queryKey: ['topics'], queryFn: () => topicService.list().then(r => r.data) });

export const useTopic = (id: string) =>
  useQuery({ queryKey: ['topics', id], queryFn: () => topicService.get(id).then(r => r.data), enabled: !!id });

export const useTopicTree = (id: string) =>
  useQuery({ queryKey: ['topics', id, 'tree'], queryFn: () => topicService.getTree(id).then(r => r.data), enabled: !!id });

export const useTopicBreadcrumb = (id: string | undefined) =>
  useQuery({ queryKey: ['topics', id, 'breadcrumb'], queryFn: () => topicService.getBreadcrumb(id!).then(r => r.data), enabled: !!id });

export const useCreateTopic = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTopicInput) => topicService.create(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topics'] }),
  });
};

export const useUpdateTopic = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTopicInput }) => topicService.update(id, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topics'] }),
  });
};

export const useDeleteTopic = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, withCards = false }: { id: string; withCards?: boolean }) => topicService.delete(id, withCards),
    onSuccess: (_data, { id }) => {
      // Drop the deleted topic before refetching, so its detail query does not 404
      qc.removeQueries({ queryKey: ['topics', id] });
      qc.invalidateQueries({ queryKey: ['topics'] });
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: ['study'] });
    },
  });
};
