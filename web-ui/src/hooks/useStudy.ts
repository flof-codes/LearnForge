import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { studyService } from '../api/study';
import type { CardHistoryRange, HistoryKind } from '../types';

export const useStudySummary = (topicId?: string) =>
  useQuery({
    queryKey: ['study', 'summary', topicId],
    queryFn: () => studyService.summary(topicId).then(r => r.data),
  });

export const useStudyStats = (topicId?: string) =>
  useQuery({
    queryKey: ['study', 'stats', topicId],
    queryFn: () => studyService.stats(topicId).then(r => r.data),
  });

export const useDueCards = (topicId?: string, limit = 20) =>
  useQuery({
    queryKey: ['study', 'due', topicId, limit],
    queryFn: () => studyService.due(topicId, limit).then(r => r.data),
  });

export const useDueForecast = (topicId?: string, range: 'month' | 'year' = 'month') =>
  useQuery({
    queryKey: ['study', 'forecast', topicId, range],
    queryFn: () => studyService.forecast(topicId, range).then(r => r.data),
  });

export const useHistory = (kind: HistoryKind, range: CardHistoryRange) =>
  useQuery({
    queryKey: ['study', 'history', kind, range],
    queryFn: () => studyService.history(kind, range).then(r => r.data),
    placeholderData: keepPreviousData,
  });
