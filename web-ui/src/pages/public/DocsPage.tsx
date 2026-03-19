import { Helmet } from 'react-helmet-async';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Zap, Link as LinkIcon, GraduationCap, Sparkles, Pencil, FolderTree, Mail } from 'lucide-react';

export default function DocsPage() {
  const { t, i18n } = useTranslation('legal');
  const mcpUrl = `${window.location.origin}/mcp`;

  return (
    <>
      <Helmet>
        <html lang={i18n.language} />
        <title>{t('docs.title')} — LearnForge</title>
        <meta name="description" content={t('meta.docsDescription', { defaultValue: '' })} />
        <link rel="canonical" href="https://learnforge.eu/docs" />
      </Helmet>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold text-text-primary mb-2">{t('docs.title')}</h1>
        <p className="text-text-muted text-sm mb-10">{t('docs.subtitle')}</p>

        <div className="space-y-8">
          {/* What is LearnForge */}
          <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-3">
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-accent-blue" />
              <h2 className="text-lg font-medium text-text-primary">{t('docs.whatIs.title')}</h2>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.whatIs.description')}</p>
            <ul className="text-text-muted text-sm space-y-1 list-disc list-inside">
              <li>{t('docs.whatIs.feature1')}</li>
              <li>{t('docs.whatIs.feature2')}</li>
              <li>{t('docs.whatIs.feature3')}</li>
            </ul>
          </section>

          {/* Connect to Claude */}
          <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <LinkIcon size={20} className="text-accent-blue" />
              <h2 className="text-lg font-medium text-text-primary">{t('docs.connect.title')}</h2>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              <Trans
                i18nKey="docs.connect.prerequisite"
                ns="legal"
                components={{
                  registerLink: <Link to="/register" className="text-accent-blue hover:underline" />,
                }}
              />
            </p>
            <ol className="text-text-muted text-sm space-y-2 list-decimal list-inside">
              <li>{t('docs.connect.step1')}</li>
              <li>{t('docs.connect.step2')}</li>
              <li>{t('docs.connect.step3')}</li>
            </ol>
            <pre className="bg-bg-primary rounded-lg p-4 text-sm text-text-primary overflow-x-auto border border-border">{mcpUrl}</pre>
            <ol start={4} className="text-text-muted text-sm space-y-2 list-decimal list-inside">
              <li>{t('docs.connect.step4')}</li>
              <li>{t('docs.connect.step5')}</li>
              <li>{t('docs.connect.step6')}</li>
            </ol>
            <p className="text-text-muted text-xs">{t('docs.connect.note')}</p>
          </section>

          {/* Study with AI */}
          <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <GraduationCap size={20} className="text-accent-blue" />
              <h2 className="text-lg font-medium text-text-primary">{t('docs.study.title')}</h2>
            </div>
            <p className="text-text-muted text-sm">{t('docs.study.promptsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.study.prompt1')}</code>
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.study.prompt2')}</code>
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.study.prompt3')}</code>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.study.description')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-bg-primary rounded-lg p-4 border border-border">
                <p className="text-text-primary text-sm font-medium mb-1">{t('docs.study.chatMode')}</p>
                <p className="text-text-muted text-xs leading-relaxed">{t('docs.study.chatModeDesc')}</p>
              </div>
              <div className="bg-bg-primary rounded-lg p-4 border border-border">
                <p className="text-text-primary text-sm font-medium mb-1">{t('docs.study.mcqMode')}</p>
                <p className="text-text-muted text-xs leading-relaxed">{t('docs.study.mcqModeDesc')}</p>
              </div>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.study.workflow')}</p>
          </section>

          {/* Create Cards */}
          <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Sparkles size={20} className="text-accent-blue" />
              <h2 className="text-lg font-medium text-text-primary">{t('docs.cards.title')}</h2>
            </div>
            <p className="text-text-muted text-sm">{t('docs.cards.promptsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.cards.prompt1')}</code>
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.cards.prompt2')}</code>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.cards.description')}</p>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.cards.workflow')}</p>
          </section>

          {/* Manage Cards */}
          <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Pencil size={20} className="text-accent-blue" />
              <h2 className="text-lg font-medium text-text-primary">{t('docs.manageCards.title')}</h2>
            </div>
            <p className="text-text-muted text-sm">{t('docs.manageCards.promptsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.manageCards.prompt1')}</code>
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.manageCards.prompt2')}</code>
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.manageCards.prompt3')}</code>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.manageCards.description')}</p>
            <ul className="text-text-muted text-sm space-y-1 list-disc list-inside">
              <li>{t('docs.manageCards.cap1')}</li>
              <li>{t('docs.manageCards.cap2')}</li>
              <li>{t('docs.manageCards.cap3')}</li>
              <li>{t('docs.manageCards.cap4')}</li>
            </ul>
          </section>

          {/* Manage Topics */}
          <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <FolderTree size={20} className="text-accent-blue" />
              <h2 className="text-lg font-medium text-text-primary">{t('docs.topics.title')}</h2>
            </div>
            <p className="text-text-muted text-sm">{t('docs.topics.promptsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.topics.prompt1')}</code>
              <code className="bg-bg-surface px-2.5 py-1 rounded text-sm text-text-primary">{t('docs.topics.prompt2')}</code>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.topics.description')}</p>
            <ul className="text-text-muted text-sm space-y-1 list-disc list-inside">
              <li>{t('docs.topics.cap1')}</li>
              <li>{t('docs.topics.cap2')}</li>
              <li>{t('docs.topics.cap3')}</li>
              <li>{t('docs.topics.cap4')}</li>
            </ul>
          </section>

          {/* Need Help? */}
          <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-3">
            <div className="flex items-center gap-3">
              <Mail size={20} className="text-accent-blue" />
              <h2 className="text-lg font-medium text-text-primary">{t('docs.help.title')}</h2>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">{t('docs.help.contact')}</p>
            <p>
              <a href={`mailto:${t('docs.help.email')}`} className="text-accent-blue text-sm hover:underline">
                {t('docs.help.email')}
              </a>
            </p>
            <p className="text-text-muted text-sm">
              <Link to="/privacy" className="text-accent-blue hover:underline">{t('docs.help.privacyLink')}</Link>
              {' · '}
              <Link to="/terms" className="text-accent-blue hover:underline">{t('docs.help.termsLink')}</Link>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
