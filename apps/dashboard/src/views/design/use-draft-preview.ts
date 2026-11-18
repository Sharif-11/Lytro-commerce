import { useEffect, useState } from 'react';
import type { StorefrontThemeKey } from '@lytronix/validators';
import { usePreviewLink } from '@/api/storefront-design';
import { appConfig } from '@/lib/app-config';
import { useShell } from '@/shell/shell-context';

// STOREFRONT-BUILDER-PLAN SB-12: the live preview's address -- the storefront's /preview through a short-lived signed
// link, at the shop's Lytro address (the one host that lets the dashboard frame it, deploy/Caddyfile).

// A preview link lasts 30 minutes (STOREFRONT_PREVIEW_MINUTES); a new one is asked a little before.
const RENEW_MS = 25 * 60 * 1000;

/**
 * The preview's address, a new one asked before the last ends; `version` reloads it after each save. `tried`, from the
 * theme gallery, shows a theme over the draft without saving it there.
 */
export function useDraftPreview(version: number, tried?: StorefrontThemeKey | null): string | null {
  const { slug } = useShell();
  const link = usePreviewLink();
  const [token, setToken] = useState<string | null>(null);
  const ask = link.mutate;
  useEffect(() => {
    const renew = () => {
      ask(undefined, {
        onSuccess: (made) => {
          setToken(made.token);
        },
      });
    };
    renew();
    const timer = window.setInterval(renew, RENEW_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [ask]);
  if (token === null) return null;
  const theme = tried ? `&theme=${tried}` : '';
  return `${appConfig.shopUrl(slug)}/preview?t=${encodeURIComponent(token)}&v=${String(version)}${theme}`;
}
