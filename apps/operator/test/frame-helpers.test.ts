import { describe, expect, it } from 'vitest';
import { bandTitleKey, navGroups, phoneTabs } from '../src/components/layout/nav-items';
import bn from '../src/i18n/locales/bn.json';
import en from '../src/i18n/locales/en.json';
import { environmentOf } from '../src/lib/environment';
import { formatSessionTime } from '../src/lib/session-time';
import { browserOf } from '../src/lib/user-agent';

describe('environmentOf', () => {
  it('names the deployment from its address', () => {
    expect(environmentOf('admin.lytro.app')).toBe('production');
    expect(environmentOf('admin.staging.lytro.app')).toBe('staging');
    expect(environmentOf('localhost')).toBe('local');
  });

  it('never calls another address production', () => {
    expect(environmentOf('admin.lytro.app.evil.test')).toBe('local');
  });
});

describe('browserOf', () => {
  const cases: [string, string][] = [
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome · Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge · Windows',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; 23106RN0DA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox · macOS',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox · Linux'],
  ];

  it.each(cases)('reads %s', (userAgent, expected) => {
    expect(browserOf(userAgent)).toBe(expected);
  });

  it('has nothing to say about what it cannot recognise', () => {
    expect(browserOf(null)).toBeNull();
    expect(browserOf('curl/8.0')).toBeNull();
  });
});

describe('formatSessionTime', () => {
  it('writes the date and time in Dhaka, in the drawn form', () => {
    expect(formatSessionTime('2026-10-21T03:12:00.000Z')).toBe('21 Oct, 09:12');
  });
});

describe('the navigation', () => {
  it('names the section in the band, and leaves Today to the wordmark', () => {
    expect(bandTitleKey('/')).toBeNull();
    expect(bandTitleKey('/rates')).toBe('nav.rates');
    expect(bandTitleKey('/catalogue/shop-types')).toBe('nav.shopTypes');
    expect(bandTitleKey('/account')).toBe('nav.account');
  });

  it('has its every word in both languages', () => {
    const items = [...navGroups.flatMap((group) => group.items), ...phoneTabs];
    const keys = [
      ...navGroups.map((group) => group.labelKey),
      ...items.map((item) => item.labelKey),
    ];
    for (const key of keys) {
      const name = key.replace('nav.', '') as keyof typeof en.nav;
      expect(en.nav[name], key).toBeTruthy();
      expect(bn.nav[name], key).toBeTruthy();
    }
  });
});
