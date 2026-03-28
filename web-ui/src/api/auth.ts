import api from './client';
import type { User, McpKeyStatus } from '../types';

export interface LoginResponse {
  token: string;
}

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post<LoginResponse>('/auth/register', { email, password, name }),
  getMe: () =>
    api.get<User>('/auth/me'),
  getMcpKeyStatus: () =>
    api.get<McpKeyStatus>('/auth/mcp-key/status'),
  generateMcpKey: () =>
    api.post<{ key: string }>('/auth/mcp-key'),
  revokeMcpKey: () =>
    api.delete('/auth/mcp-key'),
  updateProfile: (data: { name?: string; email?: string; current_password?: string }) =>
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
