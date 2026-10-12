import type { Page } from '@playwright/test';
import { PROXY_PORT } from './ports';

const CSRF_STORAGE_KEY = 'lytronix.tenant.csrf';

/** Puts an already-API-created session into a tab: the cookie into the browser's own cookie jar (what the
    real Set-Cookie response would have done), and the CSRF token into that origin's sessionStorage — the
    frontend's own route guard (`tenantSession.isSignedIn()`) reads the token from storage, never the
    HttpOnly cookie it can't see, so without this second step every protected route bounces straight back
    to /sign-in regardless of the cookie being perfectly valid. sessionStorage is per-origin and can only be
    set from a page already on that origin, hence the detour through a neutral page first. */
export async function signInTab(
  page: Page,
  host: string,
  session: { cookie: string; csrfToken: string },
): Promise<void> {
  const [name, value] = session.cookie.split('=');
  if (!name || value === undefined) throw new Error(`malformed cookie: ${session.cookie}`);
  await page
    .context()
    .addCookies([{ name, value, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' }]);

  await page.goto(`http://${host}:${String(PROXY_PORT)}/sign-in`);
  await page.evaluate(
    ({ key, token }) => {
      sessionStorage.setItem(key, token);
    },
    { key: CSRF_STORAGE_KEY, token: session.csrfToken },
  );
}

export function dashboardUrl(host: string): string {
  return `http://${host}:${String(PROXY_PORT)}/dashboard`;
}
