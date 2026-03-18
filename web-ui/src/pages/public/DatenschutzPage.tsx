import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSection } from './LegalPageLayout';

export default function DatenschutzPage() {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout title={t('datenschutz.title')} lastUpdated={t('datenschutz.lastUpdated')}>
      <LegalSection title={t('datenschutz.introTitle')}>
        <p>{t('datenschutz.introText')}</p>
      </LegalSection>

      <LegalSection title={t('datenschutz.controllerTitle')}>
        <p>{t('datenschutz.controllerText')}</p>
        <p>{t('datenschutz.controllerName')}</p>
        <p>{t('datenschutz.controllerAddress')}</p>
        <p>
          E-Mail:{' '}
          <a href={`mailto:${t('datenschutz.controllerEmail')}`} className="text-accent-blue hover:underline">
            {t('datenschutz.controllerEmail')}
          </a>
        </p>
      </LegalSection>

      <LegalSection title={t('datenschutz.dataCollectedTitle')}>
        <p>{t('datenschutz.dataCollectedIntro')}</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>{t('datenschutz.dataAccount')}</li>
          <li>{t('datenschutz.dataLearning')}</li>
          <li>{t('datenschutz.dataTechnical')}</li>
        </ul>
      </LegalSection>

      <LegalSection title={t('datenschutz.legalBasisTitle')}>
        <ul className="list-disc pl-5 space-y-2">
          <li>{t('datenschutz.legalBasisContract')}</li>
          <li>{t('datenschutz.legalBasisLegitimate')}</li>
        </ul>
      </LegalSection>

      <LegalSection title={t('datenschutz.storageTitle')}>
        <p>{t('datenschutz.storageText')}</p>
      </LegalSection>

      <LegalSection title={t('datenschutz.retentionTitle')}>
        <p>{t('datenschutz.retentionText')}</p>
      </LegalSection>

      <LegalSection title={t('datenschutz.rightsTitle')}>
        <p>{t('datenschutz.rightsIntro')}</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>{t('datenschutz.rightAccess')}</li>
          <li>{t('datenschutz.rightRectification')}</li>
          <li>{t('datenschutz.rightErasure')}</li>
          <li>{t('datenschutz.rightPortability')}</li>
          <li>{t('datenschutz.rightRestriction')}</li>
          <li><strong>{t('datenschutz.rightObjection')}</strong></li>
          <li>{t('datenschutz.rightComplaint')}</li>
        </ul>
      </LegalSection>

      <LegalSection title={t('datenschutz.cookiesTitle')}>
        <p>{t('datenschutz.cookiesText')}</p>
      </LegalSection>

      <LegalSection title={t('datenschutz.thirdPartyTitle')}>
        <p>{t('datenschutz.thirdPartyIntro')}</p>
        <p>{t('datenschutz.thirdPartyStripe')}</p>
        <p>{t('datenschutz.thirdPartyEmbeddings')}</p>
        <p>{t('datenschutz.thirdPartyFsrs')}</p>
        <p>{t('datenschutz.thirdPartyNone')}</p>
      </LegalSection>

      <LegalSection title={t('datenschutz.automatedTitle')}>
        <p>{t('datenschutz.automatedText')}</p>
      </LegalSection>

      <LegalSection title={t('datenschutz.changesTitle')}>
        <p>{t('datenschutz.changesText')}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
