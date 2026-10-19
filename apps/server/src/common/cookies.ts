/**
 * TEN-29: a session cookie's name. Wherever cookies are Secure (staging and production), the `__Host-` prefix makes
 * the browser refuse a cookie of that name unless it was set by this exact host, with no Domain attribute and
 * Path=/ -- so no shop's subdomain can plant one for the dashboard or the operator console. Plain HTTP development
 * can't use the prefix, so it keeps the bare name.
 */
export function sessionCookieName(base: string, secure: boolean): string {
  return secure ? `__Host-${base}` : base;
}

/**
 * TEN-29: whether a state-changing request may come from `origin`. A browser always sends Origin on such a request,
 * so another origin is refused. A request with none is not from a browser and carries no cookie the browser sent on
 * its own; the CSRF token (SEC-14) still applies to it. `allowed` null skips the check (development).
 */
export function originAllowed(origin: string | undefined, allowed: string | null): boolean {
  if (allowed === null || origin === undefined) return true;
  return origin === allowed;
}
