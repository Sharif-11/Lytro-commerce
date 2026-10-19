import i18n from 'i18next';
import { startLanguage } from '@lytronix/ui';
import bn from './locales/bn.json';
import en from './locales/en.json';

// I18N-01: Bangla by default, an English toggle that changes every visible label. I18N-02: the choice
// persists per device (localStorage), not per account — no backend call needed for this.
startLanguage(
  i18n,
  { defaultLanguage: 'bn', storageKey: 'lytro.language' },
  { bn: { translation: bn }, en: { translation: en } },
);

export default i18n;
