import { headers } from 'next/headers';
import { phoneShown } from '@lytronix/validators';
import type { PublicShop } from '@/lib/api/storefront-api';
import type { PageTheme } from '@/lib/design/design-look';
import { firstLetter } from '@/lib/design/marks';
import { type Language, Words } from '@/lib/i18n/words';
import { STOREFRONT_PATH_HEADER } from '@/lib/request-path';
import { shopChatOf } from '@/lib/shop/shop-chat';
import { CartButton } from '../cart/cart-button';
import { Icon } from '../icon';
import { LanguageSwitch } from '../language-switch';
import { SearchTools } from '../search/search-panel';
import type { HeaderNav } from '../shell';
import { DesignIcon } from './design-icon';
import { MenuDrawer } from './menu-drawer';

// STOREFRONT-BUILDER-PLAN SB-8, SB-17: the header and footer every page of a designed shop wears, as the sketch draws
// them (docs/brand/lytro-storefront-builder.html, `SECTIONS.header` and `.footer`), in the theme's style. Their search,
// account, cart and language are the storefront's own, unchanged.

// The sketch's header names "All products", "Offers" and then this many categories.
const NAV_CATEGORIES = 5;
// The footer lists this many categories.
const FOOTER_CATEGORIES = 4;

/** The shop's logo, or its first letter on the theme's mark where it has none (TEN-16). */
function ShopMark({ shop }: { shop: Pick<PublicShop, 'name' | 'logo'> }) {
  return shop.logo ? (
    <img src={shop.logo.urls.thumbnail} alt={shop.name} />
  ) : (
    <>
      <span className="sb-mk">{firstLetter(shop.name)}</span>
      <span>{shop.name}</span>
    </>
  );
}

/** Which of the header's links the page is: every product (home and New arrivals), the offers, or a category. */
function lit(path: string, current: string | undefined): string | null {
  if (current !== undefined) return current;
  if (path === '/' || path === '/new') return 'all';
  if (path === '/offers') return 'offers';
  return null;
}

/** The theme's header: a way back (inner pages) or to the categories, the shop, search, account and cart, then the
    links to every product, the offers and the first categories. */
export async function DesignedHeader({
  shop,
  theme,
  language,
  nav,
  backHref,
}: {
  shop: PublicShop;
  theme: PageTheme;
  language: Language;
  nav: HeaderNav;
  /** An inner page's way back, in the menu's place. */
  backHref?: string;
}) {
  const words = new Words(language);
  const path = (await headers()).get(STOREFRONT_PATH_HEADER) ?? '/';
  const on = lit(path, nav.current);
  return (
    <header className={`sb-hd sb-${theme.header}`}>
      <div className="sb-wrap sb-row">
        {backHref === undefined ? (
          // The owner, 2026-11-19: the menu opens a drawer of the lists, categories, help and language.
          <MenuDrawer
            shopName={shop.name}
            categories={nav.categories}
            whatsapp={shopChatOf(shop.contact).whatsapp}
            language={language}
            variables={theme.variables}
            current={on}
          />
        ) : (
          <a className="sb-menu" href={backHref} aria-label={words.t('back')}>
            <Icon name="back" />
          </a>
        )}
        <a className={shop.logo ? 'sb-logo sb-img' : 'sb-logo'} href="/">
          <ShopMark shop={shop} />
        </a>
        <SearchTools
          language={language}
          categories={nav.categories}
          phoneButton={false}
          only="box"
        />
        <div className="sb-icons">
          <SearchTools language={language} categories={nav.categories} phoneButton only="button" />
          {/* BL-11: order tracking, as Bonik AI's header has it; its words beside the truck on a computer. */}
          <a className="sb-trk" href="/track" aria-label={words.t('sb_track_h')}>
            <DesignIcon name="truck" />
            <span>
              <b>{words.t('sb_track_h')}</b>
              {words.t('sb_track_where')}
            </span>
          </a>
          {/* Signed in it opens My account; signed out, /account leads to Sign in. */}
          <a className="sb-acct" href="/account" aria-label={words.t('account')}>
            <DesignIcon name="user" />
          </a>
          <CartButton
            language={language}
            shopPhone={nav.shopPhone}
            areaId={nav.areaId}
            startOpen={nav.startCartOpen}
          />
        </div>
      </div>
      <nav className="sb-nav">
        <a href="/new" className={on === 'all' ? 'sb-on' : undefined}>
          {words.t('sb_all')}
        </a>
        <a href="/offers" className={on === 'offers' ? 'sb-on' : undefined}>
          {words.t('sb_offers')}
        </a>
        {nav.categories.slice(0, NAV_CATEGORIES).map((category) => (
          <a
            key={category.id}
            href={`/c/${category.slug}`}
            className={on === category.slug ? 'sb-on' : undefined}
          >
            {category.name}
          </a>
        ))}
      </nav>
    </header>
  );
}

/** The theme's footer: the shop with its chat links, the shop's lists, its first categories, its contact details, then
    the year, the language, Lytro's privacy policy and "Powered by Lytro" (SFT-21, TEN-18, Part 99). */
export function DesignedFooter({
  shop,
  categories,
  language,
}: {
  shop: PublicShop;
  categories: HeaderNav['categories'];
  language: Language;
}) {
  const words = new Words(language);
  const { phone, email, address } = shop.contact;
  const chat = shopChatOf(shop.contact);
  const social = [
    chat.whatsapp
      ? {
          key: 'wa',
          icon: 'wa' as const,
          href: chat.whatsapp.href,
          label: words.t('shop_whatsapp'),
        }
      : null,
    chat.messenger
      ? {
          key: 'msgr',
          icon: 'msgr' as const,
          href: chat.messenger.href,
          label: words.t('shop_messenger'),
        }
      : null,
    chat.facebook
      ? {
          key: 'fb',
          icon: 'fb' as const,
          href: chat.facebook.href,
          label: words.t('shop_facebook'),
        }
      : null,
  ].filter((link) => link !== null);
  // The owner, 2026-11-19: the shop's WhatsApp and Facebook page by name too, when it has them.
  const contact = [
    phone !== null ? (
      <li key="phone">
        <a href={`tel:${phone}`}>{phoneShown(phone)}</a>
      </li>
    ) : null,
    chat.whatsapp ? (
      <li key="wa">
        <a href={chat.whatsapp.href} target="_blank" rel="noopener noreferrer">
          {words.t('sb_whatsapp')}
        </a>
      </li>
    ) : null,
    chat.facebook ? (
      <li key="fb">
        <a href={chat.facebook.href} target="_blank" rel="noopener noreferrer">
          {words.t('sb_facebook_page')}
        </a>
      </li>
    ) : null,
    email !== null ? (
      <li key="email">
        <a href={`mailto:${email}`}>{email}</a>
      </li>
    ) : null,
    address !== null ? <li key="address">{address}</li> : null,
  ].filter((line) => line !== null);
  return (
    <footer className="sb-ft">
      <div className="sb-wrap">
        <div className="sb-cols">
          <div className="sb-about">
            <a className={shop.logo ? 'sb-logo sb-img' : 'sb-logo'} href="/">
              <ShopMark shop={shop} />
            </a>
            {social.length > 0 ? (
              <div className="sb-soc">
                {social.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                  >
                    <span>
                      <Icon name={link.icon} />
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <h3>{words.t('sb_shop_h')}</h3>
            <ul>
              <li>
                <a href="/new">{words.t('sb_all')}</a>
              </li>
              <li>
                <a href="/offers">{words.t('sb_offers')}</a>
              </li>
              <li>
                <a href="/best">{words.t('sb_best_sellers')}</a>
              </li>
              <li>
                <a href="/track">{words.t('track')}</a>
              </li>
            </ul>
          </div>
          {categories.length > 0 ? (
            <div>
              <h3>{words.t('categories')}</h3>
              <ul>
                {categories.slice(0, FOOTER_CATEGORIES).map((category) => (
                  <li key={category.id}>
                    <a href={`/c/${category.slug}`}>{category.name}</a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {contact.length > 0 ? (
            <div>
              <h3>{words.t('sb_contact')}</h3>
              <ul>{contact}</ul>
            </div>
          ) : null}
        </div>
        <div className="sb-base">
          <span>
            © {new Date().getFullYear()} {shop.name}
          </span>
          <span className="sb-legal">
            <LanguageSwitch language={language} as="link" />
            <a href="https://lytro.app/privacy" target="_blank" rel="noopener">
              {words.t('p99Privacy')}
            </a>
          </span>
          <a className="sb-pbl" href="https://lytro.app" rel="noopener">
            {/* The owner, 2026-11-19: Lytro's mark (docs/brand/lytro-mark.svg), white in the teal circle. */}
            <i aria-hidden="true">
              <svg viewBox="0 0 64 64">
                <path d="M15 15V49H31L49 29" />
              </svg>
            </i>
            Powered by Lytro
          </a>
        </div>
      </div>
    </footer>
  );
}
