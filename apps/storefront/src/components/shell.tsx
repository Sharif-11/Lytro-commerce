import type { CSSProperties, ReactNode } from 'react';
import type { PublicBrand, PublicCategory, PublicShop } from '@/lib/api/storefront-api';
import { storefrontTheme } from '@/lib/brand/brand-theme';
import { type Language, Words } from '@/lib/i18n/words';
import { CartButton } from './cart/cart-button';
import { Icon } from './icon';
import { LanguageSwitch } from './language-switch';
import { SearchTools } from './search/search-panel';

// The prototype's page frame (docs/brand/lytro-storefront.html: shell, hdr, foot and the bare pages), as components.
// The root `.frame` is the container its layout rules measure, filling the window.

export interface ShopFace {
  name: string;
  logo: PublicShop['logo'];
}

/** TEN-16: the shop's logo, or the first letter of its name where it has none, as the prototype draws it. */
export function Logo({ shop, style }: { shop: ShopFace; style?: CSSProperties }) {
  return (
    <span className="logo" style={style}>
      {shop.logo ? (
        <img src={shop.logo.urls.thumbnail} alt="" />
      ) : (
        Array.from(shop.name.trim())[0]?.toUpperCase()
      )}
    </span>
  );
}

/** The root. Its language sets the prototype's Bangla line height (I18N-01); a shop's own identity, while it shows,
    sets its colours and faces here and chooses the corner and spacing presets (BRN-02, Slice 12c), its faces' stylesheet
    hoisted into the head. */
export function Frame({
  language,
  brand,
  children,
}: {
  language: Language;
  brand?: PublicBrand | null;
  children: ReactNode;
}) {
  const theme = brand ? storefrontTheme(brand) : null;
  return (
    <div
      className="frame"
      data-lang={language}
      lang={language}
      data-corners={theme?.corners}
      data-spacing={theme?.spacing}
      style={theme?.variables}
    >
      {theme?.fontsUrl ? (
        <>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={theme.fontsUrl} precedence="default" />
        </>
      ) : null}
      {children}
    </div>
  );
}

/** The shell: the header, the scrolling page with its footer, and whatever sits over them (bar, sheet, toast). */
export function Shell({
  language,
  brand,
  header,
  footer,
  children,
  overlay,
}: {
  language: Language;
  brand?: PublicBrand | null;
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <Frame language={language} brand={brand}>
      <div className="shell">
        {header}
        <div className="scroll">
          <div className="page">
            {children}
            {footer}
          </div>
        </div>
        {overlay}
      </div>
    </Frame>
  );
}

/** What a storefront page's header reaches: the categories (the first six as links on a wide screen, all of them as
    search suggestions), the one it is in, and the cart with the shopper's area. */
export interface HeaderNav {
  categories: PublicCategory[];
  current?: string;
  shopPhone: string | null;
  areaId: number | null;
  startCartOpen?: boolean;
}

// STOREFRONT-DESIGN §1: a wide screen's header names the first six categories.
const NAV_CATEGORIES = 6;

/** The header. `minimal` is the landing page's: the shop and the language only, no way into the catalogue (LND-01).
    `home` is the storefront's: the shop, the categories on a wide screen, search and the cart. `back` is an inner
    page's: a way back and its title on a phone, the shop on a wide screen, then the same. */
export function Header({
  shop,
  language,
  variant,
  title,
  backHref,
  nav,
}: {
  shop: ShopFace;
  language: Language;
  variant: 'minimal' | 'back' | 'home';
  title?: string;
  backHref?: string;
  nav?: HeaderNav;
}) {
  const words = new Words(language);
  const face = (
    <>
      <Logo shop={shop} />
      <span className="name">{shop.name}</span>
    </>
  );
  if (variant === 'minimal') {
    return (
      <div className="hdr minimal">
        <span className="shop">{face}</span>
        <LanguageSwitch language={language} as="pill" />
      </div>
    );
  }
  const links = nav ? (
    <nav className="nav">
      {nav.categories.slice(0, NAV_CATEGORIES).map((category) => (
        <a
          key={category.id}
          href={`/c/${category.slug}`}
          className={category.slug === nav.current ? 'on' : undefined}
        >
          {category.name}
        </a>
      ))}
    </nav>
  ) : null;
  const tools = (phoneSearch: boolean) =>
    nav ? (
      <>
        <SearchTools language={language} categories={nav.categories} phoneButton={phoneSearch} />
        <CartButton
          language={language}
          shopPhone={nav.shopPhone}
          areaId={nav.areaId}
          startOpen={nav.startCartOpen}
        />
      </>
    ) : (
      <LanguageSwitch language={language} as="pill" />
    );
  if (variant === 'back') {
    return (
      <div className="hdr">
        <a className="back" href={backHref ?? '/'} aria-label={words.t('back')}>
          <Icon name="back" />
        </a>
        <span className="ttl">{title}</span>
        <a className="shop donly" href="/">
          {face}
        </a>
        {links}
        {tools(false)}
      </div>
    );
  }
  return (
    <div className="hdr">
      <a className="shop" href="/">
        {face}
      </a>
      {links}
      {tools(true)}
    </div>
  );
}

/** SFT-21: the shop's name and logo, and whichever of its phone, email and address are set; none set, no contact
    block. The storefront's links lead to its categories and the language (tracking and the account join with
    Phase 4); the landing page's lead only out to the shop, and only while its storefront is on (SFT-16). */
export function Footer({
  shop,
  language,
  landing,
  storefrontOn,
}: {
  shop: PublicShop;
  language: Language;
  landing: boolean;
  storefrontOn: boolean;
}) {
  const words = new Words(language);
  const { phone, email, address } = shop.contact;
  const hasContact = phone !== null || email !== null || address !== null;
  return (
    <footer className="foot">
      <div className="cols">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="fshop">
            <Logo shop={shop} />
            <span>{shop.name}</span>
          </div>
          {hasContact ? (
            <div className="contact">
              {phone !== null ? (
                <div>
                  <Icon name="phone" />
                  <a href={`tel:${phone}`}>{phone}</a>
                </div>
              ) : null}
              {email !== null ? (
                <div>
                  <Icon name="mail" />
                  <a href={`mailto:${email}`}>{email}</a>
                </div>
              ) : null}
              {address !== null ? (
                <div>
                  <Icon name="pin" />
                  <span>{address}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="links">
          {landing && storefrontOn ? <a href="/">{words.t('browse_shop')}</a> : null}
          {landing ? null : <a href="/#categories">{words.t('categories')}</a>}
          <LanguageSwitch language={language} as="link" />
        </div>
        <div className="pb">
          <span>
            © {new Date().getFullYear()} {shop.name}
          </span>
          <a href="https://lytro.app" rel="noopener" style={{ color: 'inherit' }}>
            <Icon name="pb" />
          </a>
        </div>
      </div>
    </footer>
  );
}

/** The mark over a bare page where no shop may be named: a question mark, as the prototype draws "nothing here". */
export function UnknownMark() {
  return (
    <span className="logo" style={{ background: 'var(--n200)', color: 'var(--n700)' }}>
      ?
    </span>
  );
}

/** A page with nothing but a message: offline (SFT-12), no shop here, or a product that is gone (LND-03). */
export function BarePage({
  language,
  brand,
  mark,
  title,
  text,
  action,
}: {
  language: Language;
  brand?: PublicBrand | null;
  mark: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <Frame language={language} brand={brand}>
      <div className="bare">
        <div className="box">
          {mark}
          <h1>{title}</h1>
          <p>{text}</p>
          {action}
          <div style={{ color: 'var(--subtle)' }}>
            <Icon name="pb" />
          </div>
        </div>
      </div>
    </Frame>
  );
}
