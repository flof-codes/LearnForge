import api from './client';
import axios from 'axios';

export interface ShareLink {
  id: string;
  token: string;
  topic_id: string;
  topic_name?: string;
  url: string;
  created_at: string;
  revoked_at: string | null;
}

export interface SharePreview {
  topic_name: string;
  topic_description: string | null;
  card_count: number;
  subtopic_count: number;
}

const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3333',
  headers: { 'Content-Type': 'application/json' },
});

export const shareService = {
  list:    ()                              => api.get<ShareLink[]>('/shares'),
  create:  (topicId: string)               => api.post<ShareLink>('/shares', { topic_id: topicId }),
  revoke:  (id: string)                    => api.delete(`/shares/${id}`),
  preview: (token: string)                 => publicApi.get<SharePreview>(`/shares/preview/${token}`),
  accept:  (token: string)                 => api.post<{ topic_id: string }>(`/shares/accept/${token}`),
};
