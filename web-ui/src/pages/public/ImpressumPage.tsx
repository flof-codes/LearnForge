import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSection } from './LegalPageLayout';

export default function ImpressumPage() {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout title={t('impressum.title')} lastUpdated={t('impressum.lastUpdated')} slug="impressum">
      <p className="text-text-muted">{t('impressum.intro')}</p>

      <LegalSection title={t('impressum.operator')}>
        <p>{t('impressum.name')}</p>
        <p>{t('impressum.address')}</p>
        <p>{t('impressum.city')}</p>
      </LegalSection>

      <LegalSection title={t('impressum.contactTitle')}>
        <p>
          E-Mail:{' '}
          <a href={`mailto:${t('impressum.email')}`} className="text-accent-blue hover:underline">
            {t('impressum.email')}
          </a>
        </p>
      </LegalSection>

      <LegalSection title={t('impressum.euDisputeTitle')}>
        <p>{t('impressum.euDisputeText')}</p>
        <p>
          <a
            href={t('impressum.euDisputeLink')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue hover:underline break-all"
          >
            {t('impressum.euDisputeLink')}
          </a>
        </p>
        <p>{t('impressum.euDisputeNote')}</p>
      </LegalSection>

      <LegalSection title={t('impressum.disclaimerTitle')}>
        <p>{t('impressum.disclaimerText')}</p>
      </LegalSection>

      <p className="text-text-muted italic">{t('impressum.vatNote')}</p>
    </LegalPageLayout>
  );
}
