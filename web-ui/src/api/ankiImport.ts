import api from './client';
import type { AnkiImport } from '../types';

export const ankiImportService = {
  upload: (file: File, onProgress?: (fraction: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<AnkiImport>('/import/anki', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
    });
  },
  get:    (id: string)                              => api.get<AnkiImport>(`/import/anki/${id}`),
  list:   ()                                        => api.get<AnkiImport[]>('/import/anki'),
  commit: (id: string, schedule: 'keep' | 'fresh') => api.post<AnkiImport>(`/import/anki/${id}/commit`, { schedule }),
  remove: (id: string)                              => api.delete(`/import/anki/${id}`),
};
