import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalPageLayout({ title, lastUpdated, children }: Props) {
  const { i18n } = useTranslation();

  return (
    <>
      <Helmet>
        <html lang={i18n.language} />
        <title>{title} — LearnForge</title>
      </Helmet>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold text-text-primary mb-2">{title}</h1>
        <p className="text-text-muted text-sm mb-10">
          {i18n.language.startsWith('de') ? 'Zuletzt aktualisiert' : 'Last updated'}: {lastUpdated}
        </p>
        <div className="space-y-8 text-text-primary/90 text-sm leading-relaxed">
          {children}
        </div>
      </div>
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-medium text-text-primary mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
