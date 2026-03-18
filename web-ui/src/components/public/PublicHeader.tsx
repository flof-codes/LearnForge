import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import LogoIcon from './LogoIcon';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';

export default function PublicHeader() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-bg-primary/90 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <LogoIcon size={24} />
          <span className="text-lg font-medium text-text-primary tracking-tight">LearnForge</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <a href="/#features" className="text-sm text-text-muted hover:text-text-primary transition-colors">
            {t('nav.features')}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            {t('nav.github')}
          </a>
          <LanguageSwitcher />
          <Link
            to="/login"
            className="text-sm px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-bg-surface transition-colors"
          >
            {t('nav.login')}
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-text-muted hover:text-text-primary"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-bg-primary px-6 py-4 space-y-4">
          <a
            href="/#features"
            onClick={() => setMobileOpen(false)}
            className="block text-sm text-text-muted hover:text-text-primary"
          >
            {t('nav.features')}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-text-muted hover:text-text-primary"
          >
            {t('nav.github')}
          </a>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <LanguageSwitcher />
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="text-sm px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-bg-surface transition-colors"
            >
              {t('nav.login')}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
