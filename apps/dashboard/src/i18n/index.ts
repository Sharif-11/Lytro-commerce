import i18n from 'i18next';
import { startLanguage } from '@lytronix/ui';
import bn from './locales/bn.json';
import en from './locales/en.json';
import homeBn from './locales/home/bn.json';
import homeEn from './locales/home/en.json';
import menuBn from './locales/menu/bn.json';
import menuEn from './locales/menu/en.json';
import moneyBn from './locales/money/bn.json';
import moneyEn from './locales/money/en.json';
import onboardingBn from './locales/onboarding/bn.json';
import onboardingEn from './locales/onboarding/en.json';
import ordersBn from './locales/orders/bn.json';
import ordersEn from './locales/orders/en.json';
import shellBn from './locales/shell/bn.json';
import shellEn from './locales/shell/en.json';
import shopBn from './locales/shop/bn.json';
import shopEn from './locales/shop/en.json';
import walletBn from './locales/wallet/bn.json';
import walletEn from './locales/wallet/en.json';

// I18N-01: Bangla by default, an English toggle that changes every visible label. I18N-02: the choice
// persists per device (localStorage), not per account — no backend call needed for this.
// TENANT-DASHBOARD-DESIGN §11: one namespace per hub, from the prototype's own words, as each is rebuilt; `shell`
// holds the frame's (the bars, the rail, the side column, banners, search and the + menu); `home` Home's; `money` the
// Money hub's, with the Renew and Unavailable pages; `menu` the Menu hub's; `shop` the Shop hub's (from Slice 11.7);
// `orders` the Orders hub's (from Slice 4.8a);
// `onboarding` the sign-in and sign-up steps outside a shop; `wallet`
// the wallet payment step every paying screen ends with. The first build's screens keep the default `translation` namespace until their own pull request rebuilds them.
startLanguage(
  i18n,
  { defaultLanguage: 'bn', storageKey: 'lytro.language' },
  {
    bn: {
      translation: bn,
      shell: shellBn,
      home: homeBn,
      money: moneyBn,
      menu: menuBn,
      shop: shopBn,
      orders: ordersBn,
      onboarding: onboardingBn,
      wallet: walletBn,
    },
    en: {
      translation: en,
      shell: shellEn,
      home: homeEn,
      money: moneyEn,
      menu: menuEn,
      shop: shopEn,
      orders: ordersEn,
      onboarding: onboardingEn,
      wallet: walletEn,
    },
  },
);

export default i18n;
