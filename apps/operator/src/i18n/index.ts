import i18n from 'i18next';
import { startLanguage } from '@lytronix/ui';
import bn from './locales/bn.json';
import en from './locales/en.json';

// The console is English-leaning (BRAND-IDENTITY §8.4) with a Bangla toggle; the choice persists per device
// (I18N-02) under its own key, apart from the seller dashboard's.
startLanguage(
  i18n,
  { defaultLanguage: 'en', storageKey: 'lytro.operator.language' },
  { bn: { translation: bn }, en: { translation: en } },
);

export default i18n;
