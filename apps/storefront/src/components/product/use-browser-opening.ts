'use client';

import { useEffect, useRef } from 'react';
import { AREA_COOKIE, parseArea } from '../../lib/area';

/** What a page the edge keeps leaves to the browser: the variant a `?v=` link names (LND-06) and the remembered area. */
export interface BrowserOpening {
  linkedVariantId: string | null;
  areaId: number | null;
}

/** The link and the area as this browser holds them. */
export function browserOpening(search: string, cookie: string): BrowserOpening {
  const linked = new URLSearchParams(search).get('v');
  const prefix = `${AREA_COOKIE}=`;
  const area = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return {
    linkedVariantId: linked !== null && linked.length > 0 ? linked : null,
    areaId: parseArea(area),
  };
}

/** Slice 9.10, D9-32: a product or landing page Cloudflare's edge keeps opens the same for every shopper; this applies
    the shopper's own link and area once, after its first paint. Later choices are the shopper's. */
export function useBrowserOpening(
  enabled: boolean,
  apply: (opening: BrowserOpening) => void,
): void {
  const applied = useRef(false);
  useEffect(() => {
    if (!enabled || applied.current) return;
    applied.current = true;
    apply(browserOpening(window.location.search, document.cookie));
  }, [enabled, apply]);
}
