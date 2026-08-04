import api from './client';
import type { User, McpKeyStatus } from '../types';

export interface LoginResponse {
  token: string;
}

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),
  register: (email: string, password: string, name: string, locale?: string) =>
    api.post<LoginResponse>('/auth/register', { email, password, name, locale }),
  requestEmailVerification: (locale?: string) =>
    api.post<{ success: boolean; already_verified: boolean }>('/auth/verify-email/request', { locale }),
  confirmEmailVerification: (token: string) =>
    api.post<{ success: boolean }>('/auth/verify-email/confirm', { token }),
  requestPasswordReset: (email: string, locale?: string) =>
    api.post<{ success: boolean }>('/auth/password-reset/request', { email, locale }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    api.post<{ success: boolean }>('/auth/password-reset/confirm', { token, new_password: newPassword }),
  getMe: () =>
    api.get<User>('/auth/me'),
  getMcpKeyStatus: () =>
    api.get<McpKeyStatus>('/auth/mcp-key/status'),
  generateMcpKey: () =>
    api.post<{ key: string }>('/auth/mcp-key'),
  revokeMcpKey: () =>
    api.delete('/auth/mcp-key'),
  updateProfile: (data: { name?: string; email?: string; current_password?: string; locale?: string }) =>
    api.put<User>('/auth/profile', data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.put<{ success: boolean }>('/auth/password', data),
  deleteAccount: (password: string) =>
    api.delete('/auth/account', { data: { password } }),
};

export const billingService = {
  createCheckout: (plan: 'monthly' | 'annual') =>
    api.post<{ url: string }>('/billing/checkout', { plan }),
  createPortalSession: () => api.post<{ url: string }>('/billing/portal'),
};
