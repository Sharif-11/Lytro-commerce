import { describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../src/lib/app-config';
import { installOffers, onIphoneBrowser } from '../src/lib/install-prompt';

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

describe('Help (TENANT-DASHBOARD-DESIGN §7.18)', () => {
  it('opens the deployment’s support WhatsApp, and is not offered without one', () => {
    const env = (number?: string) => ({ VITE_SUPPORT_WHATSAPP: number }) as ImportMetaEnv;
    expect(new AppConfig(env('+880 1000-000000')).supportChatUrl()).toBe(
      'https://wa.me/8801000000000',
    );
    expect(new AppConfig(env('')).supportChatUrl()).toBeNull();
    expect(new AppConfig(env()).supportChatUrl()).toBeNull();
  });
});
