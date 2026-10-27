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
