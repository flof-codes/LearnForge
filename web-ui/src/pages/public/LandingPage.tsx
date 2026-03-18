import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import HeroSection from '../../components/public/landing/HeroSection';
import ProblemSection from '../../components/public/landing/ProblemSection';
import SolutionSection from '../../components/public/landing/SolutionSection';
import FeaturesSection from '../../components/public/landing/FeaturesSection';
import HowItWorksSection from '../../components/public/landing/HowItWorksSection';
import BloomSection from '../../components/public/landing/BloomSection';
import OpenSourceSection from '../../components/public/landing/OpenSourceSection';
import CommunitySection from '../../components/public/landing/CommunitySection';
import PricingSection from '../../components/public/landing/PricingSection';

export default function LandingPage() {
  const { t, i18n } = useTranslation('landing');

  return (
    <>
      <Helmet>
        <html lang={i18n.language} />
        <title>LearnForge — {t('meta.title')}</title>
        <meta name="description" content={t('meta.description')} />
        <meta property="og:title" content={`LearnForge — ${t('meta.title')}`} />
        <meta property="og:description" content={t('meta.description')} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://learnforge.eu/" />
      </Helmet>

      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <FeaturesSection />
      <HowItWorksSection />
      <BloomSection />
      <OpenSourceSection />
      <CommunitySection />
      <PricingSection />
    </>
  );
}
