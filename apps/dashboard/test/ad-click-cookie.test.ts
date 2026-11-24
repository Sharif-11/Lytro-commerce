import { describe, expect, it } from 'vitest';
import { AdClickCookie, type ClickPage } from '../src/lib/ad-click-cookie';

const NOW = 1795400000000;

function pageAt(search: string, cookie = '', protocol = 'https:'): ClickPage {
  return { location: { search, protocol }, document: { cookie } };
}

function remembered(page: ClickPage, domain = 'lytro.app'): string {
  new AdClickCookie(
    { platformDomain: domain },
    () => page,
    () => NOW,
  ).remember();
  return page.document.cookie;
}

describe("an ad click kept as Meta's _fbc cookie (MKT-03)", () => {
  it('keeps the click for the whole platform domain, 90 days, over HTTPS', () => {
    expect(remembered(pageAt('?fbclid=IwAR2abc_DEF-123&utm_source=fb'))).toBe(
      `_fbc=fb.1.${String(NOW)}.IwAR2abc_DEF-123; Path=/; Max-Age=7776000; SameSite=Lax; Domain=.lytro.app; Secure`,
    );
  });

  it("follows staging's domain", () => {
    expect(remembered(pageAt('?fbclid=abc'), 'staging.lytro.app')).toContain(
      'Domain=.staging.lytro.app',
    );
  });

  it('leaves a click already kept, and a page without a click, as they are', () => {
    expect(remembered(pageAt('?fbclid=new', '_ga=1; _fbc=fb.1.1.old'))).toBe(
      '_ga=1; _fbc=fb.1.1.old',
    );
    expect(remembered(pageAt('?utm_source=fb'))).toBe('');
  });

  it('refuses a click ID with anything but letters, digits, _ and -', () => {
    expect(remembered(pageAt('?fbclid=abc%3Bdomain%3Devil.com'))).toBe('');
  });

  it('keeps it on its own host on a local dev server', () => {
    const cookie = remembered(pageAt('?fbclid=abc', '', 'http:'), 'localhost');
    expect(cookie).not.toContain('Domain=');
    expect(cookie).not.toContain('Secure');
  });
});
