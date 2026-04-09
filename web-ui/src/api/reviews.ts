import api from './client';
import type { SubmitReviewInput, ReviewResponse } from '../types';

export const reviewService = {
  submit: (data: SubmitReviewInput) => api.post<ReviewResponse>('/reviews', data),
  delete: (id: string) => api.delete(`/reviews/${id}`),
};
