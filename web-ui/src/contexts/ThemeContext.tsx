import { createContext, useContext, useState, useEffect, useSyncExternalStore, useCallback, useMemo, type ReactNode } from 'react';

type ThemePreference = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'learnforge_theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function subscribeToMediaQuery(cb: () => void) {
  const mq = window.matchMedia(MEDIA_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'light' || stored === 'dark') ? stored : 'auto';
  });

  const systemTheme = useSyncExternalStore(subscribeToMediaQuery, getSystemTheme);

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => theme === 'auto' ? systemTheme : theme,
    [theme, systemTheme],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
