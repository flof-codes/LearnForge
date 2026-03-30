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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'LearnForge',
        description: t('seo.orgDescription'),
        url: 'https://learnforge.eu',
        applicationCategory: t('seo.appCategory'),
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          description: t('pricing.trial.title'),
        },
        featureList: [
          'Dynamic question reformulation',
          "Bloom's Taxonomy progression",
          'FSRS spaced repetition',
          'AI-native card creation',
          'Multiple study modalities',
        ],
      },
      {
        '@type': 'Organization',
        name: 'LearnForge',
        url: 'https://learnforge.eu',
        logo: 'https://learnforge.eu/logo.svg',
        sameAs: ['https://github.com/flof-codes/LearnForge'],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: t('seo.faq.q1'), acceptedAnswer: { '@type': 'Answer', text: t('seo.faq.a1') } },
          { '@type': 'Question', name: t('seo.faq.q2'), acceptedAnswer: { '@type': 'Answer', text: t('seo.faq.a2') } },
          { '@type': 'Question', name: t('seo.faq.q3'), acceptedAnswer: { '@type': 'Answer', text: t('seo.faq.a3') } },
          { '@type': 'Question', name: t('seo.faq.q4'), acceptedAnswer: { '@type': 'Answer', text: t('seo.faq.a4') } },
        ],
      },
    ],
  };

  return (
    <>
      <Helmet>
        <html lang={i18n.language} />
        <title>{`LearnForge — ${t('meta.title')}`}</title>
        <meta name="description" content={t('meta.description')} />
        <link rel="canonical" href="https://learnforge.eu/" />
        {/* Open Graph */}
        <meta property="og:title" content={`LearnForge — ${t('meta.title')}`} />
        <meta property="og:description" content={t('meta.description')} />
        <meta property="og:image" content="https://learnforge.eu/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="https://learnforge.eu/" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="LearnForge" />
        <meta property="og:locale" content={i18n.language === 'de' ? 'de_DE' : 'en_US'} />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`LearnForge — ${t('meta.title')}`} />
        <meta name="twitter:description" content={t('meta.description')} />
        <meta name="twitter:image" content="https://learnforge.eu/og-image.png" />
        {/* JSON-LD */}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
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
