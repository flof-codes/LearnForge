import api from './client';
import type { GlassesToken } from '../types';

/** Admin-only: pairs the G2 glasses app by one-time code and manages its tokens. */
export const glassesService = {
  claim:  (code: string) => api.post<GlassesToken>('/glasses/claim', { code }),
  list:   ()             => api.get<GlassesToken[]>('/glasses/tokens'),
  revoke: (id: string)   => api.delete<void>(`/glasses/tokens/${id}`),
};
