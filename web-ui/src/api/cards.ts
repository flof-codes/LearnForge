import api from './client';
import type { CardWithState, Card, CreateCardInput, UpdateCardInput } from '../types';

export const cardService = {
  get:    (id: string)                          => api.get<CardWithState>(`/cards/${id}`),
  create: (data: CreateCardInput)               => api.post<CardWithState>('/cards', data),
  update: (id: string, data: UpdateCardInput)   => api.put<Card>(`/cards/${id}`, data),
  delete: (id: string)                          => api.delete(`/cards/${id}`),
  reset:  (id: string)                          => api.post<CardWithState>(`/cards/${id}/reset`),
};
