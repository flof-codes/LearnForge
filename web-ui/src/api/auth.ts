import api from './client';

export interface LoginResponse {
  token: string;
}

export const authService = {
  login: (password: string) => api.post<LoginResponse>('/auth/login', { password }),
};
