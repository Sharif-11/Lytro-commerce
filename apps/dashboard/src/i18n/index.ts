import i18n from 'i18next';
import { startLanguage } from '@lytronix/ui';
import bn from './locales/bn.json';
import en from './locales/en.json';
import shellBn from './locales/shell/bn.json';
import shellEn from './locales/shell/en.json';

// I18N-01: Bangla by default, an English toggle that changes every visible label. I18N-02: the choice
// persists per device (localStorage), not per account — no backend call needed for this.
// TENANT-DASHBOARD-DESIGN §11: one namespace per hub, from the prototype's own words, as each is rebuilt; `shell`
// holds the frame's (the bars, the rail, the side column, banners, search and the + menu). The first build's screens
// keep the default `translation` namespace until their own pull request rebuilds them.
startLanguage(
  i18n,
  { defaultLanguage: 'bn', storageKey: 'lytro.language' },
  {
    bn: { translation: bn, shell: shellBn },
    en: { translation: en, shell: shellEn },
  },
);

export default i18n;
