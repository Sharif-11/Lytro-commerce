import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { type PublicShop, ShopBusy } from '@/lib/api/storefront-api';
import { EDGE_MARK_NAME, edgeMarkContent } from '@/lib/edge/edge-cache';
import type { Words } from '@/lib/i18n/words';
import { loadBusyFace, ShopPaused } from '@/lib/storefront';
import { PausedPage } from './paused-page';
import { ReloadButton } from './reload-button';
import { ReloadCountdown } from './reload-countdown';
import { BarePage, Logo } from './shell';

// Slice 9.10 (STOREFRONT-DESIGN §7h, the prototype's `p910-busy`): a page the server was too busy to give (429 or 503)
// says so calmly, the way the offline page does, and loads itself again after the server's wait. Pages take it by
// wrapping themselves, so no page carries its own copy; every other fault, and Next's not-found and redirects, go on as
// thrown, so a real fault still shows the error page.

/** The busy page: the shop's mark and colours when its last read is known, the words, Try again and the countdown.
    Never indexed, however the page met the wait, so a crawler never keeps it in place of the shop's page. */
export function BusyPage({
  words,
  shop,
  seconds,
}: {
  words: Words;
  shop: PublicShop | null;
  seconds: number;
}) {
  return (
    <>
      <meta name="robots" content="noindex" />
      {/* Slice 9.10: the middleware answers this page with a 503 the edge never keeps (lib/edge). */}
      <meta name={EDGE_MARK_NAME} content={edgeMarkContent({ kind: 'busy', seconds })} />
      <BarePage
        language={words.language}
        brand={shop?.brand ?? null}
        mark={shop ? <Logo shop={shop} /> : null}
        title={words.t('p910BusyH')}
        text={words.t('p910BusyP')}
        action={
          <>
            <ReloadButton label={words.t('p910BusyBtn')} />
            <ReloadCountdown language={words.language} seconds={seconds} />
          </>
        }
      />
    </>
  );
}

/** A page that shows the busy page when the server was too busy for one of the reads it makes. Every read a page needs
    has to happen inside it, not in a component it renders, for the wait to be caught here. */
export function withBusyPage<P>(
  render: (props: P) => Promise<ReactNode>,
): (props: P) => Promise<ReactNode> {
  return async (props) => {
    try {
      return await render(props);
    } catch (error) {
      if (error instanceof ShopPaused) {
        return <PausedPage page={error.page} seconds={error.retryAfter} />;
      }
      if (!(error instanceof ShopBusy)) throw error;
      const { words, shop } = await loadBusyFace();
      return <BusyPage words={words} shop={shop} seconds={error.retryAfter} />;
    }
  };
}

/** A page's tags, or none of them when the server was too busy: the busy page then says noindex alone, with no index
    tag of the frame's beside it. */
export function withBusyMetadata<P>(
  read: (props: P) => Promise<Metadata>,
): (props: P) => Promise<Metadata> {
  return async (props) => {
    try {
      return await read(props);
    } catch (error) {
      if (!(error instanceof ShopBusy)) throw error;
      return { robots: null };
    }
  };
}
