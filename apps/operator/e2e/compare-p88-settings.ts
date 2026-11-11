import type { Page } from '@playwright/test';
import { drawnSettings } from './support/console-data';
import type { ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN v7 §9 (Slice 8.8): the help line's four settings and media costs' five, each pair a screen of the
// sketch's "Phase 8 · Slice 8.8" group beside the console showing the same. compare.spec.ts takes these.

export interface P88Pair {
  screen: string;
  path: string;
  state?: ConsoleState;
  then?: (page: Page) => Promise<void>;
}

/** Both help numbers set by an operator, as the sketch draws them once they are. */
const HELP_SET: ConsoleState = {
  settings: drawnSettings().map((setting) =>
    setting['key'] === 'help_whatsapp' || setting['key'] === 'help_phone'
      ? {
          ...setting,
          value: setting['key'] === 'help_whatsapp' ? '01711000001' : '01711000002',
          updatedBy: 'op-1',
          updatedByEmail: 'ops@lytro.app',
        }
      : setting,
  ),
};

const HELP: [string, string] = ['Help line', 'হেল্প লাইন'];
const MEDIA: [string, string] = ['Media costs', 'মিডিয়া খরচ'];
const WHATSAPP: [string, string] = ["Lytro's WhatsApp", 'Lytro-র WhatsApp'];
const CLOSES: [string, string] = ['Closes', 'বন্ধ হয়'];
const OPENS: [string, string] = ['Opens', 'খোলে'];

/** A settings group's heading at the top of the page, as the sketch opens it. */
function toGroup([en, bn]: [string, string]): (page: Page) => Promise<void> {
  return (page) =>
    page.getByRole('heading', { name: new RegExp(`^(${en}|${bn})$`) }).evaluate((heading) => {
      heading.scrollIntoView({ block: 'start' });
    });
}

/** A setting opened to change, its group at the top. */
function changeSetting(group: [string, string], [en, bn]: [string, string]) {
  return async (page: Page): Promise<void> => {
    await toGroup(group)(page);
    await page.getByRole('button', { name: new RegExp(`^(Change: ${en}|বদলান: ${bn})$`) }).click();
  };
}

/** A value typed and sent with a reason, so the refusal shows under it. */
function refused(group: [string, string], name: [string, string], typed: string) {
  return async (page: Page): Promise<void> => {
    await changeSetting(group, name)(page);
    await page.locator('main input[name=value]').fill(typed);
    await page.locator('main [name=reason]').fill('The help line changed');
    await page.locator('main form button[type=submit]').click();
  };
}

/** The value the sketch draws in the field, typed in. */
function typed(group: [string, string], name: [string, string], value: string) {
  return async (page: Page): Promise<void> => {
    await changeSetting(group, name)(page);
    await page.locator('main input[name=value]').fill(value);
  };
}

const PRICES: [string, string] = ["Cloudflare's prices", 'Cloudflare-এর দাম'];

export const P88_SETTINGS_PAIRS: P88Pair[] = [
  { screen: 'p88-settings-help', path: '/settings', then: toGroup(HELP) },
  { screen: 'p88-setting-whatsapp', path: '/settings', then: changeSetting(HELP, WHATSAPP) },
  {
    screen: 'p88-setting-phone-bad',
    path: '/settings',
    then: refused(HELP, WHATSAPP, '01511 23'),
  },
  { screen: 'p88-settings-help-set', path: '/settings', state: HELP_SET, then: toGroup(HELP) },
  {
    screen: 'p88-setting-whatsapp-change',
    path: '/settings',
    state: HELP_SET,
    then: changeSetting(HELP, WHATSAPP),
  },
  {
    screen: 'p88-setting-whatsapp-clear',
    path: '/settings',
    state: HELP_SET,
    then: async (page) => {
      await changeSetting(HELP, WHATSAPP)(page);
      await page.getByRole('button', { name: /^(Clear|মুছুন)$/ }).click();
    },
  },
  { screen: 'p88-setting-hours', path: '/settings', then: changeSetting(HELP, CLOSES) },
  { screen: 'p88-setting-hours-bad', path: '/settings', then: refused(HELP, CLOSES, '24') },
  { screen: 'p88-setting-closes-order', path: '/settings', then: refused(HELP, CLOSES, '8') },
  { screen: 'p88-setting-opens-order', path: '/settings', then: refused(HELP, OPENS, '23') },
  { screen: 'p88-settings-media', path: '/settings', then: toGroup(MEDIA) },
  {
    screen: 'p88-setting-email',
    path: '/settings',
    then: typed(MEDIA, ['Alert goes to', 'অ্যালার্ট যাবে'], 'alerts@lytro.app'),
  },
  {
    screen: 'p88-setting-budget',
    path: '/settings',
    then: typed(MEDIA, ['Budget a month', 'মাসে বাজেট'], '15'),
  },
  { screen: 'p88-setting-prices', path: '/settings', then: changeSetting(MEDIA, PRICES) },
  {
    screen: 'p88-setting-prices-bad',
    path: '/settings',
    then: async (page) => {
      await changeSetting(MEDIA, PRICES)(page);
      const panel = page.getByRole('dialog');
      await panel.locator('input[name=r2ClassBPerMillion]').fill('-0.36');
      await panel.locator('[name=reason]').fill('Cloudflare changed its prices');
      await panel.locator('button[type=submit]').click();
    },
  },
];
