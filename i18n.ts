import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import { COUNTRY_TO_LANG } from './data/LangTop100.ts';

function detectInitialLanguage(): string {
  try {
    const saved = localStorage.getItem('ventyLang');
    if (saved && typeof saved === 'string') return saved;
    const country = localStorage.getItem('ventyCountry');
    const fromCountry = country && COUNTRY_TO_LANG[country]?.code;
    if (fromCountry) return fromCountry;
    const browser = (navigator?.language || 'en').split('-')[0];
    return browser || 'en';
  } catch {
    return 'en';
  }
}

const initialLang = detectInitialLanguage();

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: initialLang,
    fallbackLng: 'en',
    interpolation:
    {
      escapeValue: false,
    },
    backend:
    {
      loadPath: '/locales/{{lng}}/translation.json',
    },
  });

const rtlLangs = new Set<string>(['ar', 'fa', 'ur', 'he']);

i18n.on('languageChanged', (lng) => {
  const isRtl = rtlLangs.has(lng);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lng);
    try { localStorage.setItem('ventyLang', lng); } catch {}
  }
});

export default i18n;
