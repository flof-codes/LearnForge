import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enLanding from './locales/en/landing.json';
import enLegal from './locales/en/legal.json';
import enApp from './locales/en/app.json';
import deCommon from './locales/de/common.json';
import deLanding from './locales/de/landing.json';
import deLegal from './locales/de/legal.json';
import deApp from './locales/de/app.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, landing: enLanding, legal: enLegal, app: enApp },
      de: { common: deCommon, landing: deLanding, legal: deLegal, app: deApp },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lng',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
      defaultVariables: {
        operatorName: import.meta.env.OPERATOR_NAME || 'LearnForge',
        operatorAddress: import.meta.env.OPERATOR_ADDRESS || '',
        operatorCity: import.meta.env.OPERATOR_CITY || 'Austria',
        operatorEmail: import.meta.env.OPERATOR_EMAIL || 'office@learnforge.eu',
      },
    },
  });

export default i18n;
