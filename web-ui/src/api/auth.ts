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
};

export const billingService = {
  createCheckout: () => api.post<{ url: string }>('/billing/checkout'),
  createPortalSession: () => api.post<{ url: string }>('/billing/portal'),
};
