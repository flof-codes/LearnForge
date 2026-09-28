import api from './client';
import type { Note, NoteType, UpdateNoteInput } from '../types';

export const noteService = {
  get:    (id: string)                          => api.get<Note>(`/notes/${id}`),
  update: (id: string, data: UpdateNoteInput)   => api.put<Note>(`/notes/${id}`, data),
  delete: (id: string)                          => api.delete(`/notes/${id}`),
  types:  ()                                    => api.get<NoteType[]>('/note-types'),
};
