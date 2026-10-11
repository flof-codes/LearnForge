import api from './client';
import type { AnswerMode, TutorStatus, TutorPrepared, TutorBatch, TutorAnswerResult, OpenGrade, TutorSettings } from '../types';

type SavedSettings = Omit<TutorSettings, 'models' | 'efforts'>;

interface Scope { topicId?: string; answerBy: AnswerMode[] }

export const tutorService = {
  status:  () => api.get<TutorStatus>('/tutor/status'),
  prepare: (s: Scope & { difficulty: number }) =>
    api.post<TutorPrepared>('/tutor/prepare', { topic_id: s.topicId, difficulty: s.difficulty, answer_by: s.answerBy }),
  start:   (difficulty: number) => api.post<{ sessionId: string; difficulty: number }>('/tutor/sessions', { difficulty }),
  next:    (s: Scope & { sessionId: string; exclude: string[] }) =>
    api.post<TutorBatch>('/tutor/next', { session_id: s.sessionId, topic_id: s.topicId, answer_by: s.answerBy, exclude: s.exclude }),
  answer:  (a: { questionId: string; selected?: string[]; text?: string; dontKnow?: boolean; rating: number }) =>
    api.post<TutorAnswerResult>('/tutor/answer', { question_id: a.questionId, selected: a.selected, text: a.text, dont_know: a.dontKnow, rating: a.rating }),
  settings:     () => api.get<TutorSettings>('/tutor/settings'),
  saveSettings: (change: { api_key?: string; model?: string; effort?: string }) => api.put<SavedSettings>('/tutor/settings', change),
  removeKey:    () => api.delete<SavedSettings>('/tutor/settings/key'),
  checkKey:     () => api.post<{ ok: boolean; reason: string | null; detail?: string }>('/tutor/settings/check', {}),
  grade:   (questionId: string, text: string) => api.post<OpenGrade>('/tutor/grade', { question_id: questionId, text }),
  followUp: (questionId: string, thread: { role: 'user' | 'assistant'; text: string }[]) =>
    api.post<{ text: string }>('/tutor/followup', { question_id: questionId, thread }),
};
