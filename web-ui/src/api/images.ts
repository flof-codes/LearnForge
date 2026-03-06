import api from './client';
import type { ImageRecord } from '../types';

export const imageService = {
  upload: (file: File, cardId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (cardId) form.append('card_id', cardId);
    return api.post<ImageRecord>('/images', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  url:    (id: string) => `${api.defaults.baseURL}/images/${id}`,
  delete: (id: string) => api.delete(`/images/${id}`),
};
