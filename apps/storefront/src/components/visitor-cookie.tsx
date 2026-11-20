'use client';

import { useEffect } from 'react';
import { newVisitorId, visitorCookieValue, visitorFromCookies } from '@/lib/account/visitor-cookie';

/** RTE-06 as amended (load fix 2): gives the shopper their own mark once, in the browser, so the server counts their
    requests as theirs alone. Set here rather than by the server, so a page kept for every shopper never carries one. */
export function VisitorCookie() {
  useEffect(() => {
    if (visitorFromCookies(document.cookie) !== null) return;
    document.cookie = visitorCookieValue(newVisitorId(), window.location.protocol === 'https:');
  }, []);
  return null;
}
