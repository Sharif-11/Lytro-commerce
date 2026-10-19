import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bn from './locales/bn.json';
import en from './locales/en.json';

// The console is English-leaning (BRAND-IDENTITY §8.4) with a Bangla toggle; the choice persists per device
// (I18N-02) under its own key, apart from the seller dashboard's.
export type Language = 'bn' | 'en';
export const DEFAULT_LANGUAGE: Language = 'en';
const LANGUAGE_STORAGE_KEY = 'lytro.operator.language';

function isLanguage(value: string | null): value is Language {
  return value === 'bn' || value === 'en';
}

function storedLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    bn: { translation: bn },
    en: { translation: en },
  },
  lng: storedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

export function setLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // A blocked storage only loses the memory of the choice, never the switch itself.
  }
  void i18n.changeLanguage(language);
  document.documentElement.lang = language;
}

document.documentElement.lang = storedLanguage();

export function getLanguage(): Language {
  return storedLanguage();
}

export default i18n;
