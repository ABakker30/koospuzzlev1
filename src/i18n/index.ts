import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import nlCommon from './locales/nl/common.json';
import frCommon from './locales/fr/common.json';
import esCommon from './locales/es/common.json';
import deCommon from './locales/de/common.json';
import itCommon from './locales/it/common.json';
import ptCommon from './locales/pt/common.json';
import ruCommon from './locales/ru/common.json';
import jaCommon from './locales/ja/common.json';
import koCommon from './locales/ko/common.json';
import zhCNCommon from './locales/zh-CN/common.json';
import zhTWCommon from './locales/zh-TW/common.json';

const resources = {
  en: {
    common: enCommon,
  },
  nl: {
    common: nlCommon,
  },
  fr: {
    common: frCommon,
  },
  es: {
    common: esCommon,
  },
  de: {
    common: deCommon,
  },
  it: {
    common: itCommon,
  },
  pt: {
    common: ptCommon,
  },
  ru: {
    common: ruCommon,
  },
  ja: {
    common: jaCommon,
  },
  ko: {
    common: koCommon,
  },
  'zh-CN': {
    common: zhCNCommon,
  },
  'zh-TW': {
    common: zhTWCommon,
  },
};

export const initI18n = async (initialLanguage: string = 'en') => {
  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: ['common'],
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });

  return i18n;
};

export const setLanguage = async (language: string) => {
  await i18n.changeLanguage(language);
};

export const getCurrentLanguage = () => {
  return i18n.language || 'en';
};

export default i18n;
