import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export default function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
      <button
        onClick={() => setTheme('light')}
        className={`px-2.5 py-1.5 transition-colors flex items-center gap-1 ${
          resolvedTheme === 'light'
            ? 'bg-accent-blue/15 text-accent-blue font-medium'
            : 'text-text-muted hover:text-text-primary'
        }`}
        title="Light"
      >
        <Sun size={12} />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`px-2.5 py-1.5 transition-colors flex items-center gap-1 ${
          resolvedTheme === 'dark'
            ? 'bg-accent-blue/15 text-accent-blue font-medium'
            : 'text-text-muted hover:text-text-primary'
        }`}
        title="Dark"
      >
        <Moon size={12} />
      </button>
    </div>
  );
}
