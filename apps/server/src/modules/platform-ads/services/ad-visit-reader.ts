import { Injectable } from '@nestjs/common';
import { type HttpRequest, headerValue } from '../../../common/http';
import type { AdVisit } from '../types/platform-ad';

// Meta's cookie forms: `fb.<subdomain index>.<creation ms>.<random number>` for _fbp, the click ID in place of the
// random number for _fbc. Anything else is left out, and so is an overlong value.
const META_COOKIE = /^fb\.\d{1,2}\.\d{10,14}\.[A-Za-z0-9_-]{1,500}$/;
const MAX_USER_AGENT = 512;

/**
 * MKT-03: what Meta matches an event by, read from the request it happened in. The client's address and browser come
 * from the caller (the edge-aware ClientIp); the page is the Referer without its query, which on the sign-up pages can
 * hold a phone number.
 */
@Injectable()
export class AdVisitReader {
  read(request: HttpRequest, client: { ip: string | null; userAgent: string | null }): AdVisit {
    const cookies = this.cookiesOf(headerValue(request.headers.cookie));
    return {
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
      fbp: this.metaCookie(cookies.get('_fbp')),
      fbc: this.metaCookie(cookies.get('_fbc')),
      pageUrl: this.pageOf(headerValue(request.headers.referer)),
    };
  }

  private cookiesOf(header: string | undefined): Map<string, string> {
    const found = new Map<string, string>();
    for (const part of (header ?? '').split(';')) {
      const at = part.indexOf('=');
      if (at <= 0) continue;
      const name = part.slice(0, at).trim();
      if (name === '_fbp' || name === '_fbc') found.set(name, part.slice(at + 1).trim());
    }
    return found;
  }

  private metaCookie(value: string | undefined): string | null {
    return value !== undefined && META_COOKIE.test(value) ? value : null;
  }

  private pageOf(referer: string | undefined): string | null {
    if (referer === undefined) return null;
    try {
      const url = new URL(referer);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return `${url.origin}${url.pathname}`;
    } catch {
      return null;
    }
  }
}
