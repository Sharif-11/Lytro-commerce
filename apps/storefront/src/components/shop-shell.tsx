import type { ReactNode } from 'react';
import type { OpenShopPage, PageFrame } from '@/lib/storefront';
import { Footer, Header, Shell } from './shell';

/** A storefront page (not a landing page): the header with the categories, search and the cart, the page, and the
    footer. `back` pages have a way back and a title on a phone; `current` lights a category's header link. */
export function ShopShell({
  page,
  frame,
  back,
  title,
  current,
  startCartOpen,
  children,
}: {
  page: OpenShopPage;
  frame: PageFrame;
  back?: string;
  title?: string;
  current?: string;
  startCartOpen?: boolean;
  children: ReactNode;
}) {
  const language = page.words.language;
  return (
    <Shell
      language={language}
      brand={page.info.brand}
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
      {children}
    </Shell>
  );
}
