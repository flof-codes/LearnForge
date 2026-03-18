import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { authService } from '../api/auth';

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isActive: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'learnforge_token';

async function fetchUser(
  setUser: (u: User | null) => void,
  setIsLoading: (v: boolean) => void,
  signal: AbortSignal,
) {
  try {
    const { data } = await authService.getMe();
    if (!signal.aborted) setUser(data);
  } catch {
    if (!signal.aborted) setUser(null);
  } finally {
    if (!signal.aborted) setIsLoading(false);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem(STORAGE_KEY));

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await authService.getMe();
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchUser(setUser, setIsLoading, controller.signal);
    return () => controller.abort();
  }, [token]);

  const login = useCallback((newToken: string) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    setIsLoading(true);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
    setIsLoading(false);
  }, []);

  const isActive = user?.isActive ?? false;

  return (
    <AuthContext.Provider value={{
      token,
      user,
      isAuthenticated: !!token && !!user,
      isActive,
      isLoading,
      login,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
