import type { ReactNode } from 'react';
import type { ProductCard as Card, PublicShop } from '@/lib/api/storefront-api';
import type { EmptyNext } from '@/lib/catalogue/empty';
import { cardKey } from '@/lib/design/card-links';
import type { PageTheme } from '@/lib/design/design-look';
import { firstLetter } from '@/lib/design/marks';
import type { Words } from '@/lib/i18n/words';
import { shopChatOf } from '@/lib/shop/shop-chat';
import { DesignIcon, type DesignIconName } from '../design/design-icon';
import { SectionHead } from '../design/design-parts';
import { ThemeCard } from '../design/theme-card';
import { ProductCard } from '../product-card';

// STOREFRONT-BUILDER-PLAN SB-33 (the owner, 2026-11-26), as the builder sketch's em-* screens draw it: a page with no
// products says so in one calm line, in the theme's colours, and leads on -- to more of the shop's products, or, in a
// shop with none yet, to the ways of reaching it. Never an empty heading, nothing technical, no blame.

/** An inner page's empty part in the theme's look (the home's own sections already wear it). */
export function EmptyFrame({
  theme,
  plain = false,
  children,
}: {
  theme: PageTheme | null;
  /** On the search page's white ground rather than the theme's. */
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={plain ? 'sfb sfb-list sb-em-plain' : 'sfb sfb-list'} style={theme?.variables}>
      {children}
    </div>
  );
}

/** The one line: a line icon in a soft circle, a heading, a sentence, then what comes next. */
export function EmptyBox({
  icon,
  title,
  text,
  main = false,
  card = false,
  children,
}: {
  icon: DesignIconName;
  title: string;
  text?: string | null;
  /** The page's own heading (a gone product's page has no other). */
  main?: boolean;
  /** Drawn as a card (the empty home's contacts). */
  card?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={card ? 'sb-em-box sb-em-card' : 'sb-em-box'}>
      <div className="sb-em-ic">
        <DesignIcon name={icon} />
      </div>
      {main ? <h1>{title}</h1> : <h2>{title}</h2>}
      {text ? <p>{text}</p> : null}
      {children}
    </div>
  );
}

/** Whether the shop gives shoppers any way to reach it (the public API leaves out what its plan hides, PYG-29). */
export function hasContact(shop: PublicShop): boolean {
  const chat = shopChatOf(shop.contact);
  return Boolean(chat.whatsapp ?? chat.messenger ?? chat.facebook ?? shop.contact.phone);
}

/**
 * The ways to reach the shop, only those it set and its plan shows: WhatsApp the big button, Messenger and a call side
 * by side, the Facebook page a link under them -- or the big button when it is the only one. None, nothing.
 */
export function ShopContacts({ shop, words }: { shop: PublicShop; words: Words }) {
  const chat = shopChatOf(shop.contact);
  const phone = shop.contact.phone;
  const pair = [
    chat.messenger ? (
      <a
        key="messenger"
        className="sb-em-btn sb-em-out"
        href={chat.messenger.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <DesignIcon name="msg" />
        Messenger
      </a>
    ) : null,
    phone ? (
      <a key="call" className="sb-em-btn sb-em-out" href={`tel:${phone}`}>
        <DesignIcon name="call" />
        {words.t('em_call')}
      </a>
    ) : null,
  ].filter((link) => link !== null);
  const others = chat.whatsapp !== null || pair.length > 0;
  let facebook: ReactNode = null;
  if (chat.facebook) {
    facebook = others ? (
      <span>
        <a
          className="sb-em-link"
          href={chat.facebook.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <DesignIcon name="fb" />
          {words.t('em_fb')}
        </a>
      </span>
    ) : (
      <a
        className="sb-em-btn sb-em-pri"
        href={chat.facebook.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <DesignIcon name="fb" />
        {words.t('em_fb')}
      </a>
    );
  }
  if (!others && facebook === null) return null;
  return (
    <div className="sb-em-acts">
      {chat.whatsapp ? (
        <a
          className="sb-em-btn sb-em-wa"
          href={chat.whatsapp.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <DesignIcon name="wa" />
          {words.t('em_wa')}
        </a>
      ) : null}
      {pair.length > 0 ? <div className="sb-em-two">{pair}</div> : null}
      {facebook}
    </div>
  );
}

/** A few more of the shop's products under an empty page's line, in stock first, then "See all products". */
export function MoreProducts({
  theme,
  title,
  products,
  words,
  now,
}: {
  theme: PageTheme | null;
  title: string;
  products: readonly Card[];
  words: Words;
  now: number;
}) {
  return (
    <div className="sb-em-more">
      {theme ? (
        <SectionHead style={theme.head} title={title} all={null} words={words} />
      ) : (
        <div className="sechead">
          <h2>{title}</h2>
        </div>
      )}
      {theme ? (
        <div className="sb-grid">
          {products.map((product) => (
            <ThemeCard
              key={cardKey(product)}
              product={product}
              style={theme.card}
              words={words}
              now={now}
            />
          ))}
        </div>
      ) : (
        <div className="grid">
          {products.map((product) => (
            <ProductCard key={cardKey(product)} product={product} words={words} now={now} />
          ))}
        </div>
      )}
      <a className="sb-em-all" href="/new">
        {words.t('pp_all')}
        <DesignIcon name="arrow" />
      </a>
    </div>
  );
}

/**
 * The home of a shop with no product yet (em-home-empty): in the hero's place, in its own colours, its mark, "New
 * collection coming soon" and its name; under it a card with the ways to reach it, or "Come back soon" with none.
 */
export function EmptyHome({ shop, words }: { shop: PublicShop; words: Words }) {
  const chat = shopChatOf(shop.contact);
  const direct = Boolean(chat.whatsapp ?? chat.messenger ?? shop.contact.phone);
  return (
    <>
      <section className="sb-em-hero">
        <div className="sb-em-mk">
          {shop.logo ? <img src={shop.logo.urls.thumbnail} alt="" /> : firstLetter(shop.name)}
        </div>
        <div className="sb-em-kick">{words.t('em_soon')}</div>
        <h1>{shop.name}</h1>
      </section>
      <section className="sb-sec">
        <div className="sb-wrap">
          {hasContact(shop) ? (
            <EmptyBox
              icon="msg"
              title={words.t('em_ask_h')}
              text={words.t(direct ? 'em_ask_p' : 'em_ask_fb')}
              card
            >
              <ShopContacts shop={shop} words={words} />
            </EmptyBox>
          ) : (
            <EmptyBox icon="bag" title={words.t('em_later_h')} text={words.t('em_later_p')} card />
          )}
        </div>
      </section>
    </>
  );
}

/** What a list says when other products exist: its own line in its words, and the heading over the few it offers. */
export interface EmptyLine {
  icon: DesignIconName;
  title: string;
  text: string | null;
  moreTitle: string;
}

/** A shop with no product yet: what its empty pages say, by the ways it can be reached. */
function bareText(shop: PublicShop, words: Words): string {
  const chat = shopChatOf(shop.contact);
  if (chat.whatsapp ?? chat.messenger ?? shop.contact.phone) return words.t('em_list_p');
  return chat.facebook ? words.t('em_ask_fb') : words.t('em_later_p');
}

/**
 * A list page's empty part (em-list-empty, em-category-empty, em-offers-none): "In stock only" emptied it, so say so and
 * lift the filter; the shop has nothing yet, so the home's words and its contacts; or the list's own line, then a few
 * more of the shop's products.
 */
export function EmptyList({
  next,
  line,
  unfiltered,
  shop,
  theme,
  words,
  now,
}: {
  next: EmptyNext;
  line: EmptyLine;
  /** This list without its stock filter, for "See them all". */
  unfiltered: string;
  shop: PublicShop;
  theme: PageTheme | null;
  words: Words;
  now: number;
}) {
  let body: ReactNode;
  if (next.kind === 'filtered') {
    body = (
      <EmptyBox icon="bag" title={words.t('em_stock_h')}>
        <div className="sb-em-acts">
          <a className="sb-em-btn sb-em-out" href={unfiltered}>
            {words.t('em_stock_all')}
          </a>
        </div>
      </EmptyBox>
    );
  } else if (next.kind === 'bare') {
    body = (
      <EmptyBox icon="bag" title={words.t('em_soon')} text={bareText(shop, words)}>
        <ShopContacts shop={shop} words={words} />
      </EmptyBox>
    );
  } else {
    body = (
      <>
        <EmptyBox icon={line.icon} title={line.title} text={line.text} />
        <MoreProducts
          theme={theme}
          title={line.moreTitle}
          products={next.products}
          words={words}
          now={now}
        />
      </>
    );
  }
  return <EmptyFrame theme={theme}>{body}</EmptyFrame>;
}
