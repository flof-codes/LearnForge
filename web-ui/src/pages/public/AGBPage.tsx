import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSection } from './LegalPageLayout';

export default function AGBPage() {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout title={t('agb.title')} lastUpdated={t('agb.lastUpdated')}>
      <LegalSection title={t('agb.scopeTitle')}>
        <p>{t('agb.scopeText')}</p>
      </LegalSection>

      <LegalSection title={t('agb.serviceTitle')}>
        <p>{t('agb.serviceText')}</p>
      </LegalSection>

      <LegalSection title={t('agb.accountTitle')}>
        <ul className="list-disc pl-5 space-y-2">
          <li>{t('agb.accountText1')}</li>
          <li>{t('agb.accountText2')}</li>
          <li>{t('agb.accountText3')}</li>
        </ul>
      </LegalSection>

      <LegalSection title={t('agb.ipTitle')}>
        <p>{t('agb.ipUserContent')}</p>
        <p>{t('agb.ipPlatform')}</p>
      </LegalSection>

      <LegalSection title={t('agb.betaTitle')}>
        <p>{t('agb.betaText')}</p>
      </LegalSection>

      <LegalSection title={t('agb.liabilityTitle')}>
        <p>{t('agb.liabilityText')}</p>
      </LegalSection>

      <LegalSection title={t('agb.terminationTitle')}>
        <p>{t('agb.terminationText')}</p>
      </LegalSection>

      <LegalSection title={t('agb.lawTitle')}>
        <p>{t('agb.lawText')}</p>
      </LegalSection>

      <LegalSection title={t('agb.changesTitle')}>
        <p>{t('agb.changesText')}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
