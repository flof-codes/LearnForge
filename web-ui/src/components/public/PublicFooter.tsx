import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';

export default function PublicFooter() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border bg-bg-secondary">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/logo.svg" alt="" width={20} height={20} />
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
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('footer.contact')}</h3>
            <nav className="space-y-2">
              <a href="mailto:office@learnforge.eu" className="block text-sm text-text-muted hover:text-text-primary transition-colors">
                office@learnforge.eu
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
          <p>{t('footer.license')}</p>
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
    </footer>
  );
}
