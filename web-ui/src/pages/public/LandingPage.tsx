import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import HeroSection from '../../components/public/landing/HeroSection';
import ReviewSection from '../../components/public/landing/ReviewSection';
import WaysInSection from '../../components/public/landing/WaysInSection';
import WhereSection from '../../components/public/landing/WhereSection';
import OpenSourceSection from '../../components/public/landing/OpenSourceSection';
import PricingSection from '../../components/public/landing/PricingSection';
import FaqSection, { type FaqItem } from '../../components/public/landing/FaqSection';

export default function LandingPage() {
  const { t, i18n } = useTranslation('landing');
  const faq = t('faq.items', { returnObjects: true }) as FaqItem[];

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
        offers: [
          { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: t('pricing.trial.title') },
          {
            '@type': 'Offer',
            price: '4.99',
            priceCurrency: 'EUR',
            description: t('pricing.monthly.title'),
            priceSpecification: { '@type': 'UnitPriceSpecification', price: '4.99', priceCurrency: 'EUR', billingDuration: 'P1M' },
          },
          {
            '@type': 'Offer',
            price: '48',
            priceCurrency: 'EUR',
            description: t('pricing.annual.title'),
            priceSpecification: { '@type': 'UnitPriceSpecification', price: '48', priceCurrency: 'EUR', billingDuration: 'P1Y' },
          },
        ],
        featureList: t('seo.features', { returnObjects: true }) as string[],
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
        mainEntity: faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
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
      <ReviewSection />
      <WaysInSection />
      <WhereSection />
      <PricingSection />
      <OpenSourceSection />
      <FaqSection />
    </>
  );
}
