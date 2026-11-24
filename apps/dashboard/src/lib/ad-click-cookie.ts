import { type AppConfig, appConfig } from './app-config';

// Meta's click cookie lives 90 days; a click ID is letters, digits, `_` and `-`, and never this long.
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const CLICK_ID = /^[A-Za-z0-9_-]{1,500}$/;

/** The parts of the page the cookie touches: the window's, or a stand-in in a test. */
export interface ClickPage {
  location: { search: string; protocol: string };
  document: { cookie: string };
}

/**
 * MKT-03 (the owner, 2026-11-24): the dashboard loads no Meta code, but someone who comes straight from an ad lands
 * here with `?fbclid=`. Kept as Meta's own `_fbc` cookie on the platform domain, the server's sign-up events can name
 * the click, as lytro.app's pixel would have. A cookie already there is left as it is.
 */
export class AdClickCookie {
  constructor(
    private readonly config: Pick<AppConfig, 'platformDomain'>,
    private readonly page: () => ClickPage = () => window,
    private readonly now: () => number = () => Date.now(),
  ) {}

  remember(): void {
    try {
      const { location, document } = this.page();
      const clickId = new URLSearchParams(location.search).get('fbclid');
      if (clickId === null || !CLICK_ID.test(clickId)) return;
      if (/(?:^|;\s*)_fbc=/.test(document.cookie)) return;
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      // A dev server on localhost keeps it on its own host; a cookie for "localhost" is refused.
      const domain = this.config.platformDomain.includes('.')
        ? `; Domain=.${this.config.platformDomain}`
        : '';
      document.cookie = `_fbc=fb.1.${String(this.now())}.${clickId}; Path=/; Max-Age=${String(MAX_AGE_SECONDS)}; SameSite=Lax${domain}${secure}`;
    } catch {
      // MKT-03: remembering a click never breaks the dashboard.
    }
  }
}

export const adClickCookie = new AdClickCookie(appConfig);
