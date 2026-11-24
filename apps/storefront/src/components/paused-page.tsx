import { EDGE_MARK_NAME, edgeMarkContent } from '@/lib/edge/edge-cache';
import type { OpenShopPage } from '@/lib/storefront';
import { Icon } from './icon';
import { Frame, Logo } from './shell';

/**
 * PYG-23 (PAYG-FAIR-USE-PLAN PF-13, PF-35, the sketch's `pf-paused`): a pay-as-you-go shop's storefront waits for its
 * first top-up. Every page but tracking shows this: the shop's mark and name, and that it is back soon -- never indexed,
 * and answered 503 with a Retry-After the edge never keeps (the middleware reads the busy mark), so a search engine
 * holds the shop's pages and a cached page never sells while it is paused.
 */
export function PausedPage({ page, seconds }: { page: OpenShopPage; seconds: number }) {
  const { words, info } = page;
  return (
    <>
      <meta name="robots" content="noindex" />
      <meta name={EDGE_MARK_NAME} content={edgeMarkContent({ kind: 'busy', seconds })} />
      <Frame language={words.language} brand={info.brand}>
        <div className="shell">
          <header className="hdr">
            <span className="shop">
              <Logo shop={info} />
              <span className="name">{info.name}</span>
            </span>
          </header>
          <div className="paused-page">
            <span className="ic">
              <Icon name="clock" />
            </span>
            <h1>{words.t('pfPausedH')}</h1>
            <p>{words.t('pfPausedP', { name: info.name })}</p>
            <span className="pw">
              <Icon name="pb" />
            </span>
          </div>
        </div>
      </Frame>
    </>
  );
}
