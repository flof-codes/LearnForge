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
  syncStripe: (userId: string) =>
    api.post<{
      success: boolean;
      source: 'entitlement' | 'visibility' | 'none';
      status: string | null;
      subscriptionId: string | null;
      currentPeriodEnd: string | null;
    }>(`/admin/users/${userId}/sync-stripe`),
  syncStripeAll: () =>
    api.post<{
      total: number;
      succeeded: number;
      skippedFree: number;
      failed: Array<{ userId: string; customerId: string; error: string }>;
    }>('/admin/users/sync-stripe-all'),
};
