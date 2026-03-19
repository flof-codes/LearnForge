import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LogoIcon from './LogoIcon';
import ThemeSwitcher from './ThemeSwitcher';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';
const OPERATOR_EMAIL = import.meta.env.OPERATOR_EMAIL || 'office@learnforge.eu';

export default function PublicFooter() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border bg-bg-secondary">
      {/* Bloom spectrum decorative line */}
      <div className="lf-bloom-spectrum h-[3px] rounded-full" />

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <LogoIcon size={20} />
              <span className="font-medium text-text-primary">LearnForge</span>
            </div>
            <p className="text-sm text-text-muted">{t('footer.tagline')}</p>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('footer.legal')}</h3>
            <nav className="space-y-2">
              <Link to="/impressum" className="block text-sm text-text-muted hover:text-text-primary transition-colors">
                {t('footer.impressum')}
              </Link>
              <Link to="/datenschutz" className="block text-sm text-text-muted hover:text-text-primary transition-colors">
                {t('footer.datenschutz')}
              </Link>
              <Link to="/agb" className="block text-sm text-text-muted hover:text-text-primary transition-colors">
                {t('footer.agb')}
              </Link>
              <Link to="/docs" className="block text-sm text-text-muted hover:text-text-primary transition-colors">
                {t('nav.docs')}
              </Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('footer.contact')}</h3>
            <nav className="space-y-2">
              <a href={`mailto:${OPERATOR_EMAIL}`} className="block text-sm text-text-muted hover:text-text-primary transition-colors">
                {OPERATOR_EMAIL}
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                {t('footer.github')}
              </a>
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <p>{t('footer.license')}</p>
            <span className="hidden sm:inline">·</span>
            <p>
              {t('footer.builtBy')}{' '}
              <a
                href="https://flof.codes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-blue hover:underline"
              >
                flof.codes
              </a>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeSwitcher />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors"
            >
              {t('footer.sourceCode')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
