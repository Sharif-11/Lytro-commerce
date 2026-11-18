import type { ReactNode } from 'react';
import { frameBrand } from '@/lib/design/design-look';
import type { OpenShopPage, PageFrame } from '@/lib/storefront';
import { Footer, Header, OrdersPausedBanner, Shell } from './shell';

/** A storefront page (not a landing page): the header with the categories, search and the cart, the page, and the
    footer. `back` pages have a way back and a title on a phone; `current` lights a category's header link. A `full`
    page (the designed home, SB-8) runs edge to edge, its sections keeping their own margins. The frame wears the
    shop's identity, else its theme's colour and fonts (SB-17). */
export function ShopShell({
  page,
  frame,
  back,
  title,
  current,
  startCartOpen,
  tight,
  full,
  notice,
  children,
}: {
  page: OpenShopPage;
  frame: PageFrame;
  back?: string;
  title?: string;
  current?: string;
  startCartOpen?: boolean;
  tight?: boolean;
  full?: boolean;
  /** A line over the page, as the paused-orders banner is (a draft's preview says it is one, SB-12). */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const language = page.words.language;
  return (
    <Shell
      language={language}
      brand={frameBrand(page.info)}
      tight={tight}
      full={full}
      header={
        <Header
          shop={page.info}
          language={language}
          variant={back === undefined ? 'home' : 'back'}
          title={title}
          backHref={back}
          nav={{
            categories: frame.categories,
            current,
            shopPhone: page.info.contact.phone,
            areaId: frame.areaId,
            startCartOpen,
          }}
        />
      }
      footer={<Footer shop={page.info} language={language} landing={false} storefrontOn />}
    >
      {page.savingPaused ? <OrdersPausedBanner words={page.words} /> : null}
      {notice}
      {children}
    </Shell>
  );
}
