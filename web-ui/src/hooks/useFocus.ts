import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { focusService } from '../api/focus';
import type { FocusTopicInput, ExpandedFocusEntry } from '../types';

export const useFocusTopics = () =>
  useQuery({
    queryKey: ['focus'],
    queryFn: () => focusService.list().then((r) => r.data),
  });

export const useExpandedFocus = () =>
  useQuery({
    queryKey: ['focus', 'expanded'],
    queryFn: () => focusService.expanded().then((r) => r.data),
    staleTime: 60_000,
  });

export const useSetFocusTopics = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topics: FocusTopicInput[]) => focusService.set(topics).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['study'] });
    },
  });
};

export const useClearFocusTopics = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => focusService.clear(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['study'] });
    },
  });
};

/**
 * Resolve a topic id to its active focus entry (direct or inherited via ancestor focus).
 * Returns undefined when not focused.
 */
export function useFocusForTopic(topicId: string | undefined): ExpandedFocusEntry | undefined {
  const { data } = useExpandedFocus();
  return useMemo(() => {
    if (!topicId || !data) return undefined;
    return data.find((e) => e.topic_id === topicId);
  }, [topicId, data]);
}
