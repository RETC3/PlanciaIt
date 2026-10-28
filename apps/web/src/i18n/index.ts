import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import it from './locales/it.json';

export const defaultNS = 'translation';
export const resources = { it: { translation: it } } as const;

void i18n.use(initReactI18next).init({
  lng: 'it',
  fallbackLng: 'it',
  defaultNS,
  resources,
  // React already escapes rendered values.
  interpolation: { escapeValue: false },
});

export default i18n;
