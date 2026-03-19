import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSection } from './LegalPageLayout';

export default function AGBPage() {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout title={t('agb.title')} lastUpdated={t('agb.lastUpdated')} slug="agb">
      {/* 1. Scope */}
      <LegalSection title={t('agb.scopeTitle')}>
        <p>{t('agb.scopeText')}</p>
        <p>{t('agb.scopeEmail')}</p>
        <p>{t('agb.scopeVat')}</p>
      </LegalSection>

      {/* 2. Service */}
      <LegalSection title={t('agb.serviceTitle')}>
        <p>{t('agb.serviceText')}</p>
        <p>{t('agb.serviceAvailability')}</p>
      </LegalSection>

      {/* 3. Contract */}
      <LegalSection title={t('agb.contractTitle')}>
        <p>{t('agb.contractText')}</p>
        <p>{t('agb.contractAge')}</p>
        <p>{t('agb.contractProvision')}</p>
      </LegalSection>

      {/* 4. Trial */}
      <LegalSection title={t('agb.trialTitle')}>
        <p>{t('agb.trialText')}</p>
        <p>{t('agb.trialConversion')}</p>
        <p>{t('agb.trialExpiry')}</p>
      </LegalSection>

      {/* 5. Pricing */}
      <LegalSection title={t('agb.pricingTitle')}>
        <p>{t('agb.pricingText')}</p>
        <p>{t('agb.pricingRenewal')}</p>
        <p>{t('agb.pricingReminder')}</p>
        <p>{t('agb.pricingDefault')}</p>
      </LegalSection>

      {/* 6. Withdrawal */}
      <LegalSection title={t('agb.withdrawalTitle')}>
        <p className="font-medium">{t('agb.withdrawalIntro')}</p>
        <p>{t('agb.withdrawalText')}</p>
        <p>{t('agb.withdrawalHow')}</p>
        <p>{t('agb.withdrawalEffect')}</p>
        <p>{t('agb.withdrawalExpiry')}</p>

        <div className="mt-4 border border-border rounded-lg p-4 bg-bg-primary/50 space-y-2">
          <p className="font-medium">{t('agb.withdrawalFormTitle')}</p>
          <p className="text-text-muted text-xs">{t('agb.withdrawalFormIntro')}</p>
          <div className="space-y-1 text-sm">
            <p>{t('agb.withdrawalFormTo')}</p>
            <p>{t('agb.withdrawalFormText')}</p>
            <p>{t('agb.withdrawalFormOrdered')}</p>
            <p>{t('agb.withdrawalFormName')}</p>
            <p>{t('agb.withdrawalFormAddress')}</p>
            <p>{t('agb.withdrawalFormDate')}</p>
          </div>
        </div>
      </LegalSection>

      {/* 7. Duration */}
      <LegalSection title={t('agb.durationTitle')}>
        <p>{t('agb.durationUserText')}</p>
        <p className="mt-3">{t('agb.durationOperatorText')}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t('agb.durationOperatorReason1')}</li>
          <li>{t('agb.durationOperatorReason2')}</li>
          <li>{t('agb.durationOperatorReason3')}</li>
        </ul>
        <p>{t('agb.durationOperatorRefund')}</p>
      </LegalSection>

      {/* 8. Discontinuation */}
      <LegalSection title={t('agb.discontinuationTitle')}>
        <p>{t('agb.discontinuationText')}</p>
        <p>{t('agb.discontinuationRefund')}</p>
        <p>{t('agb.discontinuationExport')}</p>
      </LegalSection>

      {/* 9. Data Export */}
      <LegalSection title={t('agb.dataExportTitle')}>
        <p>{t('agb.dataExportText')}</p>
        <p>{t('agb.dataExportGrace')}</p>
        <p>{t('agb.dataExportRetention')}</p>
      </LegalSection>

      {/* 10. Warranty */}
      <LegalSection title={t('agb.warrantyTitle')}>
        <p>{t('agb.warrantyText')}</p>
        <p>{t('agb.warrantyRemedies')}</p>
        <p>{t('agb.warrantyDevelopment')}</p>
      </LegalSection>

      {/* 11. Liability */}
      <LegalSection title={t('agb.liabilityTitle')}>
        <ol className="list-decimal pl-5 space-y-2">
          <li>{t('agb.liabilityGross')}</li>
          <li>{t('agb.liabilityConsequential')}</li>
          <li>{t('agb.liabilityBackup')}</li>
          <li>{t('agb.liabilityProduct')}</li>
        </ol>
      </LegalSection>

      {/* 12. Security */}
      <LegalSection title={t('agb.securityTitle')}>
        <p>{t('agb.securityText')}</p>
        <p>{t('agb.securityDisclaimer')}</p>
        <p>{t('agb.securityBreach')}</p>
        <p>{t('agb.securityUser')}</p>
      </LegalSection>

      {/* 13. Usage */}
      <LegalSection title={t('agb.usageTitle')}>
        <p>{t('agb.usageIntro')}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t('agb.usageRule1')}</li>
          <li>{t('agb.usageRule2')}</li>
          <li>{t('agb.usageRule3')}</li>
          <li>{t('agb.usageRule4')}</li>
        </ul>
      </LegalSection>

      {/* 14. IP */}
      <LegalSection title={t('agb.ipTitle')}>
        <p>{t('agb.ipUserContent')}</p>
        <p>{t('agb.ipLicense')}</p>
        <p>{t('agb.ipPlatform')}</p>
      </LegalSection>

      {/* 15. Price Changes */}
      <LegalSection title={t('agb.priceChangesTitle')}>
        <p>{t('agb.priceChangesText')}</p>
        <p>{t('agb.priceChangesCancel')}</p>
      </LegalSection>

      {/* 16. Privacy */}
      <LegalSection title={t('agb.privacyTitle')}>
        <p>{t('agb.privacyText')}</p>
      </LegalSection>

      {/* 17. Changes */}
      <LegalSection title={t('agb.changesTitle')}>
        <p>{t('agb.changesText')}</p>
        <p>{t('agb.changesObjection')}</p>
        <p>{t('agb.changesMinor')}</p>
      </LegalSection>

      {/* 18. Disputes */}
      <LegalSection title={t('agb.disputesTitle')}>
        <p>{t('agb.disputesOdr')}</p>
        <p>
          <a
            href={t('agb.disputesOdrLink')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue hover:underline"
          >
            {t('agb.disputesOdrLink')}
          </a>
        </p>
        <p>{t('agb.disputesNote')}</p>
      </LegalSection>

      {/* 19. Law */}
      <LegalSection title={t('agb.lawTitle')}>
        <p>{t('agb.lawText')}</p>
        <p>{t('agb.lawJurisdiction')}</p>
      </LegalSection>

      {/* 20. Final */}
      <LegalSection title={t('agb.finalTitle')}>
        <p>{t('agb.finalSeverability')}</p>
        <p>{t('agb.finalCurrent')}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
