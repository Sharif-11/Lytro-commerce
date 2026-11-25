import type { ReactNode } from 'react';
import { offeredCategories } from '@/lib/catalogue/browse';
import { frameBrand, pageTheme } from '@/lib/design/design-look';
import type { OpenShopPage, PageFrame } from '@/lib/storefront';
import { DesignedFooter, DesignedHeader } from './design/chrome';
import { Footer, Header, type HeaderNav, OrdersPausedBanner, Shell } from './shell';

/** A storefront page (not a landing page): the header with the categories, search and the cart, the page, and the
    footer. `back` pages have a way back and a title on a phone; `current` lights a category's header link. A `full`
    page (the designed home, SB-8) runs edge to edge, its sections keeping their own margins. The frame wears the
    shop's identity, else its theme's colour and fonts (SB-17); a designed shop's every page wears its theme's header
    and footer (SB-8), an older server's shop the storefront's own. */
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
  above,
  pausedInPage = false,
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
  /** SB-8: what a designed shop shows over its header (the home's announcement, as the sketch draws it). */
  above?: ReactNode;
  /** The page says itself that orders are paused (checkout), so the shell doesn't say it twice. */
  pausedInPage?: boolean;
  children: ReactNode;
}) {
  const language = page.words.language;
  // SB-33, Q4: the header's chips, the menu and the footer name only categories with something to see.
  const offered = offeredCategories(frame.categories);
  const nav: HeaderNav = {
    categories: offered,
    current,
    shopPhone: page.info.contact.phone,
    areaId: frame.areaId,
    startCartOpen,
  };
  const theme = pageTheme(page.info);
  return (
    <Shell
      language={language}
      brand={frameBrand(page.info)}
      tight={tight}
      full={full}
      header={
        theme ? (
          <div className="sfb sfb-bar" style={theme.variables}>
            {above}
            <DesignedHeader
              shop={page.info}
              theme={theme}
              language={language}
              nav={nav}
              backHref={back}
            />
          </div>
        ) : (
          <Header
            shop={page.info}
            language={language}
            variant={back === undefined ? 'home' : 'back'}
            title={title}
            backHref={back}
            nav={nav}
          />
        )
      }
      footer={
        theme ? (
          <div className="sfb sfb-foot" style={theme.variables}>
            <DesignedFooter shop={page.info} categories={offered} language={language} />
          </div>
        ) : (
          <Footer shop={page.info} language={language} landing={false} storefrontOn />
        )
      }
    >
      {page.savingPaused && !pausedInPage ? <OrdersPausedBanner words={page.words} /> : null}
      {notice}
      {children}
    </Shell>
  );
}
