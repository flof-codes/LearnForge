import api from './client';
import type { StudySummary, StudyStats, DueCard, DueForecast } from '../types';

export const studyService = {
  summary:  (topicId?: string)                                      => api.get<StudySummary>('/study/summary', { params: { topic_id: topicId } }),
  stats:    (topicId?: string)                                      => api.get<StudyStats>('/study/stats', { params: { topic_id: topicId } }),
  due:      (topicId?: string, limit = 20)                          => api.get<DueCard[]>('/study/due', { params: { topic_id: topicId, limit } }),
  forecast: (topicId?: string, range: 'month' | 'year' = 'month')  => api.get<DueForecast>('/study/due-forecast', { params: { topic_id: topicId, range } }),
};
