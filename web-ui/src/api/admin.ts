import api from './client';
import type { AdminStats, AdminUsersResponse } from '../types';

export const adminService = {
  getStats: () => api.get<AdminStats>('/admin/stats'),
  listUsers: (params: { search?: string; limit?: number; offset?: number } = {}) =>
    api.get<AdminUsersResponse>('/admin/users', { params }),
  grantFree: (userId: string) =>
    api.post<{ success: boolean }>(`/admin/users/${userId}/grant-free`),
  revokeFree: (userId: string) =>
    api.post<{ success: boolean }>(`/admin/users/${userId}/revoke-free`),
};
