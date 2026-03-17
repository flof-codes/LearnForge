import api from './client';
import type { User, McpKeyStatus } from '../types';

export interface LoginResponse {
  token: string;
}

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),
  getMe: () =>
    api.get<User>('/auth/me'),
  getMcpKeyStatus: () =>
    api.get<McpKeyStatus>('/auth/mcp-key/status'),
  generateMcpKey: () =>
    api.post<{ key: string }>('/auth/mcp-key'),
  revokeMcpKey: () =>
    api.delete('/auth/mcp-key'),
};
