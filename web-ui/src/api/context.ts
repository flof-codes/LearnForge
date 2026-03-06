import api from './client';

export const contextService = {
  topicCards: (id: string, depth = 100) => api.get(`/context/topic/${id}`, { params: { depth } }),
  similar:    (cardId: string, limit = 15) => api.get(`/context/similar/${cardId}`, { params: { limit } }),
};
