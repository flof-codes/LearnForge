import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSharePreview, useAcceptShare } from '../hooks/useShares';
import LogoIcon from '../components/public/LogoIcon';
import LoadingSpinner from '../components/LoadingSpinner';
import { extractErrorMessage } from '../utils/extractErrorMessage';

export default function SharePage() {
  const { t } = useTranslation('app');
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: preview, isLoading, isError, error } = useSharePreview(token);
  const acceptShare = useAcceptShare();

  const loginHref = `/login?next=${encodeURIComponent(`/share/${token}`)}`;
  const registerHref = `/register?next=${encodeURIComponent(`/share/${token}`)}`;

  const handleAccept = () => {
    if (!token) return;
    acceptShare.mutate(token, {
      onSuccess: (result) => {
        navigate(`/dashboard/topics/${result.topic_id}`);
      },
    });
  };

  return (
    <div className="flex items-center justify-center min-h-screen lf-hero-gradient">
      <Helmet>
        <title>{t('shares.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-md px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4">
          <ArrowLeft size={16} />
          {t('shares.backToHome')}
        </Link>

        <div className="w-full bg-bg-secondary rounded-xl border border-border p-8 space-y-5 lf-glow">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <LogoIcon size={32} />
              <span className="text-xl font-medium text-text-primary">LearnForge</span>
            </div>
            <div className="lf-bloom-spectrum h-0.5 rounded-full w-16 mx-auto mb-3" />
            <p className="text-text-muted text-sm">{t('shares.pageSubtitle')}</p>
          </div>

          {isLoading && <LoadingSpinner />}

          {isError && (
            <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-3 text-center">
              {t('shares.invalidLink')}
            </div>
          )}

          {preview && (
            <>
              <div className="bg-bg-surface rounded-lg p-4 space-y-2">
                <h2 className="text-lg font-medium">{preview.topic_name}</h2>
                {preview.topic_description && (
                  <p className="text-sm text-text-muted">{preview.topic_description}</p>
                )}
                <div className="flex gap-4 text-sm text-text-muted pt-2 border-t border-border">
                  <span>{t('shares.cardCount', { count: preview.card_count })}</span>
                  {preview.subtopic_count > 0 && (
                    <span>{t('shares.subtopicCount', { count: preview.subtopic_count })}</span>
                  )}
                </div>
              </div>

              {acceptShare.isError && (
                <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-2">
                  {extractErrorMessage(acceptShare.error) || t('shares.acceptFailed')}
                </div>
              )}

              {isAuthenticated ? (
                <button
                  onClick={handleAccept}
                  disabled={acceptShare.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Download size={16} />
                  {acceptShare.isPending ? t('shares.importing') : t('shares.importButton')}
                </button>
              ) : (
                <div className="space-y-2">
                  <Link
                    to={loginHref}
                    className="block w-full text-center py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    {t('shares.loginToImport')}
                  </Link>
                  <Link
                    to={registerHref}
                    className="block w-full text-center py-2.5 bg-bg-surface text-text-primary rounded-lg font-medium hover:bg-bg-primary transition-colors"
                  >
                    {t('shares.registerToImport')}
                  </Link>
                </div>
              )}
            </>
          )}

          {isError && !isAuthenticated && (
            <Link
              to="/"
              className="block w-full text-center py-2.5 bg-bg-surface text-text-muted rounded-lg text-sm hover:text-text-primary transition-colors"
            >
              {t('shares.backToHome')}
            </Link>
          )}
          {isError && isAuthenticated && (
            <Link
              to="/dashboard"
              className="block w-full text-center py-2.5 bg-bg-surface text-text-muted rounded-lg text-sm hover:text-text-primary transition-colors"
            >
              {t('shares.backToDashboard')}
            </Link>
          )}
        </div>

        {!preview && !isLoading && !isError && error != null && (
          <p className="text-xs text-center text-text-muted mt-4">
            {(error as unknown as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
