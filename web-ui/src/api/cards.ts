import api from './client';
import type { CardWithState, Card, CreateCardInput, UpdateCardInput } from '../types';

export type CardListStatus = 'all' | 'new' | 'learning' | 'due';
export type CardListSort = 'newest' | 'oldest' | 'updated' | 'studied' | 'concept';

export interface CardListParams {
  topicId?: string;
  includeDescendants?: boolean;
  search?: string;
  bloomLevel?: number;
  status?: CardListStatus;
  sort?: CardListSort;
  offset?: number;
  limit?: number;
}

export interface CardListResponse<T = unknown> {
  cards: T[];
  total: number;
  has_more: boolean;
}

export const cardService = {
  get:    (id: string)                          => api.get<CardWithState>(`/cards/${id}`),
  create: (data: CreateCardInput)               => api.post<CardWithState>('/cards', data),
  update: (id: string, data: UpdateCardInput)   => api.put<Card>(`/cards/${id}`, data),
  delete: (id: string)                          => api.delete(`/cards/${id}`),
  reset:  (id: string)                          => api.post<CardWithState>(`/cards/${id}/reset`),
  list:   (params: CardListParams) =>
    api.get<CardListResponse>('/cards', {
      params: {
        topic_id: params.topicId,
        include_descendants: params.includeDescendants,
        search: params.search,
        bloom_level: params.bloomLevel,
        status: params.status,
        sort: params.sort,
        offset: params.offset,
        limit: params.limit,
      },
    }),
  search: (q: string, topicId?: string, limit?: number, offset?: number) =>
    api.get<CardListResponse>('/cards/search', {
      params: { q, topic_id: topicId, limit, offset },
    }),
};
