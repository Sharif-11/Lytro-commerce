import { describe, expect, it, vi } from 'vitest';
import {
  closeInstallRow,
  inChromeLink,
  installOffers,
  installRowClosed,
  installWayOf,
  onIphoneBrowser,
} from '../src/lib/install-prompt';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const browser = (userAgent: string) => ({ userAgent }) as Navigator;

function offer(prompt: () => Promise<void>): Event {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt });
}

describe('installing the app (TEN-17)', () => {
  it('tells an iPhone how, unless the app already runs installed', () => {
    expect(onIphoneBrowser(browser(IPHONE), false)).toBe(true);
    expect(onIphoneBrowser(browser(IPHONE), true)).toBe(false);
    expect(onIphoneBrowser(browser(ANDROID), false)).toBe(false);
  });

  it('keeps the browser’s offer until Install spends it', () => {
    const changed = vi.fn();
    const stop = installOffers.subscribe(changed);
    expect(installOffers.current()).toBeNull();

    const prompt = vi.fn(() => Promise.resolve());
    const event = offer(prompt);
    window.dispatchEvent(event);
    // The browser's own banner is held back: the Menu's card offers it instead.
    expect(event.defaultPrevented).toBe(true);
    expect(installOffers.current()).toBe(event);
    expect(changed).toHaveBeenCalledTimes(1);

    installOffers.install();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(installOffers.current()).toBeNull();
    stop();
  });

  it('drops the offer once the app is installed another way', () => {
    window.dispatchEvent(offer(() => Promise.resolve()));
    expect(installOffers.current()).not.toBeNull();
    window.dispatchEvent(new Event('appinstalled'));
    expect(installOffers.current()).toBeNull();
  });
});

// TENANT-DASHBOARD-DESIGN §7.1a (the owner, 2026-11-26): the install row's one action follows the browser.
const FB_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.53.109;]';
const MESSENGER_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.42.109;]';
const INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 Instagram 350.0.0.42.86 Android';
const FB_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/489.0.0.47.104;]';
const COMPUTER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

describe('how this browser installs the app (§7.1a)', () => {
  it("takes Chrome's offer where it is made", () => {
    expect(installWayOf(ANDROID, false, true)).toBe('offer');
    expect(installWayOf(COMPUTER, false, true)).toBe('offer');
  });

  it("sends Facebook's, Messenger's and Instagram's own browsers on Android to Chrome", () => {
    expect(installWayOf(FB_ANDROID, false, false)).toBe('open-in-chrome');
    expect(installWayOf(MESSENGER_ANDROID, false, false)).toBe('open-in-chrome');
    expect(installWayOf(INSTAGRAM_ANDROID, false, false)).toBe('open-in-chrome');
    // Even if one ever offered, Chrome is still where the seller stays signed in.
    expect(installWayOf(FB_ANDROID, false, true)).toBe('open-in-chrome');
  });

  it("gives an iPhone Apple's taps, Safari first from Facebook's browser", () => {
    expect(installWayOf(IPHONE, false, false)).toBe('iphone');
    expect(installWayOf(FB_IPHONE, false, false)).toBe('iphone-in-app');
  });

  it('names the ⋮ menu on Android before the offer, and nothing on a computer without one', () => {
    expect(installWayOf(ANDROID, false, false)).toBe('menu');
    expect(installWayOf(COMPUTER, false, false)).toBeNull();
  });

  it('says nothing once it runs installed', () => {
    for (const agent of [ANDROID, FB_ANDROID, IPHONE, FB_IPHONE]) {
      expect(installWayOf(agent, true, true)).toBeNull();
    }
  });

  it("opens the shop's Home in Chrome by an intent link, the same address as its fallback", () => {
    expect(inChromeLink({ protocol: 'https:', host: 'app.lytro.app' }, '/megh')).toBe(
      'intent://app.lytro.app/megh#Intent;scheme=https;package=com.android.chrome;' +
        'S.browser_fallback_url=https%3A%2F%2Fapp.lytro.app%2Fmegh;end',
    );
  });

  it('remembers on this device that the row was closed', () => {
    window.localStorage.clear();
    expect(installRowClosed()).toBe(false);
    closeInstallRow();
    expect(installRowClosed()).toBe(true);
    window.localStorage.clear();
  });
});
