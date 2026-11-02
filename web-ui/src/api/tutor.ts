import api from './client';
import type { AnswerMode, TutorStatus, TutorPrepared, TutorBatch, TutorAnswerResult, OpenGrade, TutorSettings, Tutorial, TutorRewrite, FeedbackLabel, QuestionTerm } from '../types';

type SavedSettings = Omit<TutorSettings, 'models' | 'efforts'>;

interface Scope { topicId?: string; answerBy: AnswerMode[] }

export const tutorService = {
  status:  () => api.get<TutorStatus>('/tutor/status'),
  prepare: (s: Scope & { difficulty: number }) =>
    api.post<TutorPrepared>('/tutor/prepare', { topic_id: s.topicId, difficulty: s.difficulty, answer_by: s.answerBy }),
  start:   (difficulty: number) => api.post<{ sessionId: string; difficulty: number }>('/tutor/sessions', { difficulty }),
  setDifficulty: (sessionId: string, difficulty: number) => api.put<{ sessionId: string; difficulty: number }>(`/tutor/sessions/${sessionId}`, { difficulty }),
  next:    (s: Scope & { sessionId: string; exclude: string[] }) =>
    api.post<TutorBatch>('/tutor/next', { session_id: s.sessionId, topic_id: s.topicId, answer_by: s.answerBy, exclude: s.exclude }),
  answer:  (a: { questionId: string; selected?: string[]; text?: string; dontKnow?: boolean; rating: number }) =>
    api.post<TutorAnswerResult>('/tutor/answer', { question_id: a.questionId, selected: a.selected, text: a.text, dont_know: a.dontKnow, rating: a.rating }),
  settings:     () => api.get<TutorSettings>('/tutor/settings'),
  saveSettings: (change: { api_key?: string; model?: string; effort?: string; difficulty?: number; answer_by?: AnswerMode[] }) => api.put<SavedSettings>('/tutor/settings', change),
  removeKey:    () => api.delete<SavedSettings>('/tutor/settings/key'),
  checkKey:     () => api.post<{ ok: boolean; reason: string | null; detail?: string }>('/tutor/settings/check', {}),
  check:   (questionIds: string[], cardIds: string[]) => api.post<{ questions: string[]; cards: string[] }>('/tutor/check', { question_ids: questionIds, card_ids: cardIds }),
  grade:   (questionId: string, text: string) => api.post<OpenGrade>('/tutor/grade', { question_id: questionId, text }),
  followUp: (questionId: string, thread: { role: 'user' | 'assistant'; text: string }[]) =>
    api.post<{ text: string }>('/tutor/followup', { question_id: questionId, thread }),
  define:   (questionId: string, term: string) => api.post<{ term: string; definition: string }>('/tutor/define', { question_id: questionId, term }),
  tutorial: (questionId: string, term: string | null) =>
    api.post<{ term: string | null; tutorial: Tutorial }>('/tutor/tutorial', { question_id: questionId, ...(term ? { term } : {}) }),
  saveTerm: (questionId: string, term: string, definition: string) => api.post<QuestionTerm>('/tutor/terms', { question_id: questionId, term, definition }),
  feedback: (f: { questionId: string; labels: FeedbackLabel[]; note: string; scope: 'question' | 'card' }) =>
    api.post<TutorRewrite>('/tutor/feedback', { question_id: f.questionId, labels: f.labels, note: f.note, scope: f.scope }),
  undoFeedback: (feedbackId: string) => api.post<{ ok: boolean }>(`/tutor/feedback/${feedbackId}/undo`, {}),
};
