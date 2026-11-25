import type { Page } from '@playwright/test';
import type { ShopState } from './mock-api';

// The Menu hub's people and devices (Slice 11.6): a staff member on a billing role, the browser's install offer, and
// an iPhone, which never makes one.

/** The prototype's `menu-staff`: Kamal on a billing role, signed in with the staff password; Activity opens, Team and
 *  Settings do not. */
export const BILLING_STAFF: ShopState = {
  isOwner: false,
  signIn: 'staff',
  roles: ['বিলিং স্টাফ'],
  permissions: ['balance:read', 'balance:manage', 'payments:read', 'payments:manage', 'audit:read'],
};

/** The browser offers to install the app (Chrome's `beforeinstallprompt`); its dialog, once shown, marks the body. */
export async function offerInstall(page: Page): Promise<void> {
  await page.evaluate(() => {
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => {
        document.body.dataset['prompted'] = 'yes';
        return Promise.resolve();
      },
    });
    window.dispatchEvent(offer);
  });
}

/** Safari on an iPhone, set before the app loads. */
export async function onAnIphone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () =>
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });
  });
}

/** A browser identity set before the app loads. */
async function seenAs(page: Page, userAgent: string): Promise<void> {
  await page.addInitScript((value) => {
    Object.defineProperty(navigator, 'userAgent', { get: () => value });
  }, userAgent);
}

/** TENANT-DASHBOARD-DESIGN §7.1a: Chrome on Android before its install offer arrives (or another Android browser). */
export function onAndroid(page: Page): Promise<void> {
  return seenAs(
    page,
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  );
}

/** §7.1a: Facebook's own browser on Android, where a seller from the ad signs up; it can't install. */
export function inFacebookOnAndroid(page: Page): Promise<void> {
  return seenAs(
    page,
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.53.109;]',
  );
}

/** §7.1a: Facebook's own browser on an iPhone. */
export function inFacebookOnAnIphone(page: Page): Promise<void> {
  return seenAs(
    page,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/489.0.0.47.104;FBBV/700000000;FBDV/iPhone15,2]',
  );
}
