import api from './client';
import type { ConnectedApp, AppPairing } from '../types';

/** Apps the user connected by approving a one-time code (Lecture Scribe). */
export const appsService = {
  pairing: (code: string) => api.get<AppPairing>('/apps/pair/info', { params: { code } }),
  claim:   (code: string) => api.post<ConnectedApp>('/apps/claim', { code }),
  list:    ()             => api.get<ConnectedApp[]>('/apps/tokens'),
  revoke:  (id: string)   => api.delete<void>(`/apps/tokens/${id}`),
};
