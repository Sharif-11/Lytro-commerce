import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  PREVIEW_LAYOUT_PATH,
  previewLayoutSchema,
  type PreviewLayout,
  type StorefrontThemeKey,
} from '@lytronix/validators';
import { usePreviewLink } from '@/api/storefront-design';
import { appConfig } from '@/lib/app-config';
import { useShell } from '@/shell/shell-context';

// STOREFRONT-BUILDER-PLAN SB-12: the live preview's address -- the storefront's /preview through a short-lived signed
// link, at the shop's Lytro address (the one host that lets the dashboard frame it, deploy/Caddyfile).

// A preview link lasts 30 minutes (STOREFRONT_PREVIEW_MINUTES); a new one is asked a little before.
const RENEW_MS = 25 * 60 * 1000;

/** The preview link's token, a new one asked before the last ends; null until the first comes. */
function usePreviewToken(): string | null {
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
  return token;
}

function previewAddress(
  slug: string,
  token: string,
  version: number,
  tried?: StorefrontThemeKey | null,
): string {
  const theme = tried ? `&theme=${tried}` : '';
  return `${appConfig.shopUrl(slug)}/preview?t=${encodeURIComponent(token)}&v=${String(version)}${theme}`;
}

/**
 * The preview's address, a new one asked before the last ends; `version` reloads it after each save. `tried`, from the
 * theme gallery, shows a theme over the draft without saving it there.
 */
export function useDraftPreview(version: number, tried?: StorefrontThemeKey | null): string | null {
  const { slug } = useShell();
  const token = usePreviewToken();
  return token === null ? null : previewAddress(slug, token, version, tried);
}

/**
 * SB-32 as amended (the owner, 2026-11-26, sketch `de-*`): the preview's address, and what the draft's home leaves out
 * -- asked of the storefront beside the preview, with the same link, when the editor opens and after each save
 * (`version`). Null until it answers, and when it can't (an ended link, a busy server): the notes then simply don't show.
 */
export function useDraftPreviewAndLayout(version: number): {
  src: string | null;
  left: PreviewLayout | null;
} {
  const { slug } = useShell();
  const token = usePreviewToken();
  const layout = useQuery({
    queryKey: ['storefront', 'preview-layout', slug, token, version],
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    // After a save, the last answer stays until the new one comes, so the notes don't blink.
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<PreviewLayout | null> => {
      const answer = await fetch(
        `${appConfig.shopUrl(slug)}${PREVIEW_LAYOUT_PATH}?t=${encodeURIComponent(token ?? '')}`,
        { signal, credentials: 'omit' },
      );
      if (!answer.ok) return null;
      const parsed = previewLayoutSchema.safeParse(await answer.json().catch(() => null));
      return parsed.success ? parsed.data : null;
    },
  });
  return {
    src: token === null ? null : previewAddress(slug, token, version),
    left: layout.data ?? null,
  };
}
