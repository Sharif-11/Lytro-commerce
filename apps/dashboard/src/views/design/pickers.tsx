import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import {
  STOREFRONT_PICKED_PRODUCTS_MAX,
  StorefrontLinkKind,
  type StorefrontCollection,
  type StorefrontLink,
} from '@lytronix/validators';
import { useCategories, useProductList, useProductSearch } from '@/api/catalogue';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { CheckBox } from '@/components/ui/check-row';
import { RadioMark } from '@/components/ui/kv';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import type { ProductSummary } from '@/types/catalogue';
import { EditorIcon } from './editor-icon';

// STOREFRONT-BUILDER-PLAN SB-9, SB-16 (PR 3b, the sketch's `e-link` and `e-pick`): the steps a section's sheet opens --
// where a button leads, chosen from a list and never typed, and the products a hand-picked row shows, in its order.

/** What the editor knows of the categories and products a design names, by ID; each list read adds to it. */
export interface Names {
  categories: Map<string, string>;
  products: Map<string, string>;
}

/** The products the chosen ones' rows can show: their names and pictures, once read. */
export type Known = Map<
  string,
  Pick<ProductSummary, 'id' | 'name' | 'image' | 'minPrice' | 'basePrice'>
>;

const ROW =
  'flex w-full items-center gap-3 border-t border-neutral-100 py-[11px] text-left first:border-t-0';

function price(product: Pick<ProductSummary, 'minPrice' | 'basePrice'>): string {
  return formatTaka(product.minPrice ?? product.basePrice);
}

function Thumb({ product }: { product: Pick<ProductSummary, 'image'> }) {
  return product.image ? (
    <img
      src={product.image.urls.thumbnail}
      alt=""
      className="size-11 flex-none rounded-[8px] object-cover"
    />
  ) : (
    <span className="size-11 flex-none rounded-[8px] bg-neutral-100" />
  );
}

const LINKS: readonly { kind: StorefrontLinkKind; name: string; line: string }[] = [
  { kind: StorefrontLinkKind.OnSale, name: 'ssLinkOnSale', line: 'ssLinkOnSaleLine' },
  { kind: StorefrontLinkKind.JustIn, name: 'ssLinkJustIn', line: 'ssLinkJustInLine' },
  { kind: StorefrontLinkKind.BestSellers, name: 'ssLinkBest', line: 'ssLinkBestLine' },
  { kind: StorefrontLinkKind.Category, name: 'ssLinkACategory', line: '' },
  { kind: StorefrontLinkKind.Product, name: 'ssLinkAProduct', line: 'ssLinkAProductLine' },
];

/** SB-16: a button's place -- one of the shop's lists, a category, or a product. */
export function LinkStep({
  link,
  names,
  onChange,
  onNamed,
  label,
  kinds,
}: {
  link: StorefrontLink;
  names: Names;
  onChange: (link: StorefrontLink) => void;
  onNamed: (kind: 'categories' | 'products', id: string, name: string) => void;
  /** The list's name; a button's place by default. */
  label?: string;
  /** The choices offered; every kind of place by default. */
  kinds?: readonly StorefrontLinkKind[];
}) {
  const { t } = useTranslation('menu');
  // A category or a product is chosen from its list; until one is, the kind is only being looked at.
  const [looking, setLooking] = useState<StorefrontLinkKind>(link.kind);
  return (
    <div role="radiogroup" aria-label={label ?? t('ssLeadsTo')}>
      {LINKS.filter((choice) => !kinds || kinds.includes(choice.kind)).map((choice) => {
        const on = looking === choice.kind;
        return (
          <div key={choice.kind}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              className={ROW}
              onClick={() => {
                setLooking(choice.kind);
                if (
                  choice.kind === StorefrontLinkKind.OnSale ||
                  choice.kind === StorefrontLinkKind.JustIn ||
                  choice.kind === StorefrontLinkKind.BestSellers
                ) {
                  onChange({ kind: choice.kind });
                }
              }}
            >
              <RadioMark on={on} />
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] font-bold">{t(choice.name)}</b>
                {choice.line ? (
                  <span className="text-[12.5px] text-fg-muted">{t(choice.line)}</span>
                ) : null}
              </span>
            </button>
            {on && choice.kind === StorefrontLinkKind.Category ? (
              <CategoryList
                chosen={link.kind === StorefrontLinkKind.Category ? link.categoryId : null}
                onPick={(id, name) => {
                  onNamed('categories', id, name);
                  onChange({ kind: StorefrontLinkKind.Category, categoryId: id });
                }}
              />
            ) : null}
            {on && choice.kind === StorefrontLinkKind.Product ? (
              <ProductChoice
                chosen={link.kind === StorefrontLinkKind.Product ? link.productId : null}
                chosenName={
                  link.kind === StorefrontLinkKind.Product
                    ? (names.products.get(link.productId) ?? null)
                    : null
                }
                onPick={(id, name) => {
                  onNamed('products', id, name);
                  onChange({ kind: StorefrontLinkKind.Product, productId: id });
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** BL-3, BL-9: what a tile or a banner filling itself shows: one of the shop's lists or a category, never one product. */
export function CollectionStep({
  collection,
  label,
  names,
  onChange,
  onNamed,
}: {
  collection: StorefrontCollection;
  label: string;
  names: Names;
  onChange: (collection: StorefrontCollection) => void;
  onNamed: (kind: 'categories' | 'products', id: string, name: string) => void;
}) {
  return (
    <LinkStep
      link={collection}
      names={names}
      label={label}
      kinds={COLLECTION_KINDS}
      onNamed={onNamed}
      onChange={(link) => {
        if (link.kind !== StorefrontLinkKind.Product) onChange(link);
      }}
    />
  );
}

const COLLECTION_KINDS: readonly StorefrontLinkKind[] = [
  StorefrontLinkKind.OnSale,
  StorefrontLinkKind.JustIn,
  StorefrontLinkKind.BestSellers,
  StorefrontLinkKind.Category,
];

/** The shop's categories to choose one from, each with its picture and how many products it holds. */
function CategoryList({
  chosen,
  onPick,
}: {
  chosen: string | null;
  onPick: (id: string, name: string) => void;
}) {
  const { t } = useTranslation('menu');
  const categories = useCategories();
  if (categories.isError) return <ErrorBanner error={categories.error} />;
  if (!categories.data) return <SkeletonRows count={3} />;
  if (categories.data.length === 0) {
    return <p className="py-2 pl-8 text-[14px] text-fg-muted">{t('ssNoCategories')}</p>;
  }
  return (
    <div className="mb-1.5 ml-8 border-l-2 border-primary-soft pl-3">
      {categories.data.map((category) => (
        <button
          key={category.id}
          type="button"
          role="radio"
          aria-checked={category.id === chosen}
          className={`${ROW} py-[7px]`}
          style={{ paddingLeft: (category.depth - 1) * 16 }}
          onClick={() => {
            onPick(category.id, category.name);
          }}
        >
          <RadioMark on={category.id === chosen} />
          {category.image ? (
            <img
              src={category.image.urls.thumbnail}
              alt=""
              className="size-8 flex-none rounded-[8px] object-cover"
            />
          ) : (
            <span className="size-8 flex-none rounded-[8px] bg-neutral-100" />
          )}
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-bold">{category.name}</b>
            <span className="text-[12.5px] text-fg-muted">
              {t('ssProductCount', { count: category.productCount })}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** One product to lead to, found by searching. */
function ProductChoice({
  chosen,
  chosenName,
  onPick,
}: {
  chosen: string | null;
  chosenName: string | null;
  onPick: (id: string, name: string) => void;
}) {
  const { t } = useTranslation('menu');
  const [query, setQuery] = useState('');
  const found = useProductSearch(query);
  return (
    <div className="mb-1.5 ml-8 flex flex-col gap-2 border-l-2 border-primary-soft py-1 pl-3">
      {chosenName ? (
        <p className="text-[13.5px]">{t('ssLeadsToNow', { name: chosenName })}</p>
      ) : null}
      <SearchField
        value={query}
        onChange={setQuery}
        label={t('ssSearchProducts')}
        placeholder={t('ssSearchProducts')}
      />
      {found.data?.products.map((product) => (
        <button
          key={product.id}
          type="button"
          role="radio"
          aria-checked={product.id === chosen}
          className={ROW}
          onClick={() => {
            onPick(product.id, product.name);
          }}
        >
          <RadioMark on={product.id === chosen} />
          <Thumb product={product} />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[14px] font-bold">{product.name}</b>
            <span className="text-[12.5px] text-fg-muted">{price(product)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * SB-9: a hand-picked row's products -- searched and ticked, up to STOREFRONT_PICKED_PRODUCTS_MAX -- the chosen ones on
 * top in the order the shop shows them, moved with their arrows.
 */
export function ProductsStep({
  chosen,
  names,
  known,
  onChange,
  onSeen,
}: {
  chosen: readonly string[];
  names: Names;
  known: Known;
  onChange: (ids: string[]) => void;
  onSeen: (products: ProductSummary[]) => void;
}) {
  const { t } = useTranslation('menu');
  const [query, setQuery] = useState('');
  const list = useProductList({ search: query, segment: 'all', categoryId: null });
  const products = list.data?.pages.flatMap((page) => page.products) ?? [];
  const full = chosen.length >= STOREFRONT_PICKED_PRODUCTS_MAX;

  function toggle(product: ProductSummary): void {
    onSeen([product]);
    onChange(
      chosen.includes(product.id)
        ? chosen.filter((id) => id !== product.id)
        : [...chosen, product.id],
    );
  }

  function move(at: number, by: -1 | 1): void {
    const to = at + by;
    if (to < 0 || to >= chosen.length) return;
    const next = [...chosen];
    const [moving] = next.splice(at, 1);
    if (moving !== undefined) next.splice(to, 0, moving);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        value={query}
        onChange={setQuery}
        label={t('ssSearchProducts')}
        placeholder={t('ssSearchProducts')}
      />
      <section aria-label={t('ssChosenLabel')}>
        <h3 className="text-[14px] font-medium text-fg-muted">
          {t('ssChosen', { count: chosen.length, max: STOREFRONT_PICKED_PRODUCTS_MAX })}
        </h3>
        {chosen.length === 0 ? (
          <p className="py-2 text-[13.5px] text-fg-muted">{t('ssChosenNone')}</p>
        ) : (
          <ol>
            {chosen.map((id, at) => {
              const product = known.get(id);
              const name = product?.name ?? names.products.get(id) ?? '…';
              return (
                <li key={id} className={ROW}>
                  <span className="flex w-6 flex-none flex-col items-center text-neutral-500">
                    <button
                      type="button"
                      aria-label={t('sdMoveUp', { name })}
                      disabled={at === 0}
                      className="grid h-[22px] w-6 place-items-center disabled:opacity-35"
                      onClick={() => {
                        move(at, -1);
                      }}
                    >
                      <EditorIcon name="up" size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={t('sdMoveDown', { name })}
                      disabled={at === chosen.length - 1}
                      className="grid h-[22px] w-6 place-items-center disabled:opacity-35"
                      onClick={() => {
                        move(at, 1);
                      }}
                    >
                      <EditorIcon name="down" size={16} />
                    </button>
                  </span>
                  {product ? (
                    <Thumb product={product} />
                  ) : (
                    <span className="size-11 flex-none rounded-[8px] bg-neutral-100" />
                  )}
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-bold">{name}</b>
                    {product ? (
                      <span className="text-[12.5px] text-fg-muted">{price(product)}</span>
                    ) : null}
                  </span>
                  <span className="text-[13px] font-semibold text-neutral-500">{at + 1}</span>
                  <button
                    type="button"
                    aria-label={t('ssUnpick', { name })}
                    className="grid size-9 place-items-center rounded-[8px] text-fg-muted"
                    onClick={() => {
                      onChange(chosen.filter((each) => each !== id));
                    }}
                  >
                    <Icon name="x" size={18} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section aria-label={t('ssAllProducts')}>
        <h3 className="text-[14px] font-medium text-fg-muted">{t('ssAllProducts')}</h3>
        {list.isError ? <ErrorBanner error={list.error} /> : null}
        {!list.data && !list.isError ? <SkeletonRows count={4} /> : null}
        {products.map((product) => {
          const ticked = chosen.includes(product.id);
          return (
            <label key={product.id} className={`${ROW} cursor-pointer`}>
              <CheckBox
                checked={ticked}
                disabled={!ticked && full}
                label={product.name}
                onChange={() => {
                  toggle(product);
                }}
              />
              <Thumb product={product} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] font-bold">{product.name}</b>
                <span className="text-[12.5px] text-fg-muted">{price(product)}</span>
              </span>
            </label>
          );
        })}
        {list.hasNextPage ? (
          <Button
            tone="ghost"
            size="sm"
            busy={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage();
            }}
          >
            {t('ssShowMore')}
          </Button>
        ) : null}
        {list.data && products.length === 0 ? (
          <p className="py-2 text-[13.5px] text-fg-muted">{t('ssNoProducts')}</p>
        ) : null}
      </section>
    </div>
  );
}
