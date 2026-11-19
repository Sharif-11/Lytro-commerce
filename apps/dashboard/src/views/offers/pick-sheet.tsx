import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useCategories } from '@/api/catalogue';
import { usePickableProducts } from '@/api/offers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { CheckBox } from '@/components/ui/check-row';
import { Chip, ChipRow } from '@/components/ui/chips';
import { RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import type { OfferPick, OfferPickProduct } from '@/types/offers';
import { designsPicked, isWhole, productCount, toggleDesign, toggleProduct } from './offer-picks';
import { spanText } from './offer-words';

function Thumb({ src }: { src: string | null }): React.JSX.Element {
  return (
    <span className="flex size-11 flex-none items-center justify-center overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <Icon name="image" />}
    </span>
  );
}

/**
 * OF-25 (the sketch's `of-pick`): the shop's products to put in an offer -- a search, the top categories with Select
 * all, each product ticked whole or opened to tick some of its designs. One another offer holds (OF-16) shows which and
 * cannot be ticked. Done hands back what is ticked.
 */
export function PickSheet({
  open,
  offerId,
  picked,
  onClose,
  onDone,
}: {
  open: boolean;
  /** The offer being changed: its own products are not "in another offer". */
  offerId: string | null;
  picked: readonly OfferPick[];
  onClose: () => void;
  onDone: (picks: OfferPick[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [picks, setPicks] = useState<OfferPick[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const categories = useCategories({ enabled: open });
  const list = usePickableProducts({ search, categoryId, offerId, enabled: open });
  const products = (list.data?.pages ?? []).flatMap((page) => page.products);

  useEffect(() => {
    if (!open) return;
    setPicks([...picked]);
    setSearch('');
    setCategoryId(null);
    setOpened(
      new Set(picked.filter((pick) => pick.designId !== null).map((pick) => pick.productId)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const held = (product: OfferPickProduct) =>
    product.heldBy !== null || product.designs.some((design) => design.heldBy !== null);
  const top = (categories.data ?? []).filter((category) => category.parentId === null);

  return (
    <Sheet
      open={open}
      title={t('of.pick')}
      onClose={onClose}
      footer={
        <Button
          wide
          onClick={() => {
            onDone(picks);
          }}
        >
          {picks.length === 0 ? t('of.done') : t('of.addN', { count: productCount(picks) })}
        </Button>
      }
    >
      <div className="flex flex-col gap-2.5">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t('of.searchPh')}
          label={t('of.searchPh')}
        />
        {top.length > 0 ? (
          <ChipRow role="group">
            <Chip
              on={categoryId === null}
              onClick={() => {
                setCategoryId(null);
              }}
            >
              {t('of.all')}
            </Chip>
            {top.map((category) => (
              <Chip
                key={category.id}
                on={categoryId === category.id}
                onClick={() => {
                  setCategoryId(category.id);
                }}
              >
                {category.name}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-fg-muted">{t('of.pickHint')}</span>
          <button
            type="button"
            className="flex-none font-semibold text-primary"
            onClick={() => {
              setPicks((now) =>
                products
                  .filter((product) => !held(product))
                  .reduce<OfferPick[]>(
                    (next, product) =>
                      isWhole(next, product.productId)
                        ? next
                        : [
                            ...next.filter((pick) => pick.productId !== product.productId),
                            { productId: product.productId, designId: null },
                          ],
                    now,
                  ),
              );
            }}
          >
            {t('of.selectAll')}
          </button>
        </div>
        {list.isError ? <ErrorBanner error={list.error} /> : null}
        <div className="overflow-hidden rounded-card border border-line">
          {list.isPending ? (
            <SkeletonRows count={4} />
          ) : (
            <RowList>
              {products.map((product) => {
                const designIds = product.designs.map((design) => design.designId);
                const whole = isWhole(picks, product.productId);
                const some = designsPicked(picks, product.productId);
                const isOpen = opened.has(product.productId);
                const blocked = held(product);
                const sub = product.heldBy ? (
                  <StatusTag tone="warn">{t('of.heldBy', { name: product.heldBy.name })}</StatusTag>
                ) : product.designs.length > 0 ? (
                  some.size > 0 ? (
                    t('of.designsOf', { n: some.size, of: product.designs.length })
                  ) : (
                    t('of.designsN', { count: product.designs.length })
                  )
                ) : product.price ? (
                  <>
                    {spanText(product.price)}
                    {product.regularPrice ? (
                      <>
                        {' · '}
                        <s>{formatTaka(product.regularPrice)}</s>
                      </>
                    ) : null}
                  </>
                ) : null;
                return (
                  <div key={product.productId}>
                    <div
                      className={`flex min-h-15 items-center gap-3 px-4 py-2.5 ${product.heldBy ? 'opacity-60' : ''}`}
                    >
                      <CheckBox
                        checked={whole}
                        disabled={blocked}
                        label={product.name}
                        onChange={() => {
                          setPicks((now) => toggleProduct(now, product.productId));
                        }}
                      />
                      <Thumb src={product.image?.urls.thumbnail ?? null} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-medium">{product.name}</span>
                        <span className="truncate text-[14px] text-fg-muted">{sub}</span>
                      </span>
                      {product.designs.length > 0 ? (
                        <button
                          type="button"
                          className="flex size-10 flex-none items-center justify-center rounded-button text-fg-muted"
                          aria-expanded={isOpen}
                          aria-label={t('of.designsN', { count: product.designs.length })}
                          onClick={() => {
                            setOpened((now) => {
                              const next = new Set(now);
                              if (next.has(product.productId)) next.delete(product.productId);
                              else next.add(product.productId);
                              return next;
                            });
                          }}
                        >
                          <span className={isOpen ? 'rotate-180' : ''}>
                            <Icon name="down" />
                          </span>
                        </button>
                      ) : null}
                    </div>
                    {isOpen
                      ? product.designs.map((design) => (
                          <div
                            key={design.designId}
                            className={`flex min-h-14 items-center gap-3 py-2 pr-4 pl-11 ${design.heldBy ? 'opacity-60' : ''}`}
                          >
                            <CheckBox
                              checked={whole || some.has(design.designId)}
                              disabled={design.heldBy !== null || product.heldBy !== null}
                              label={`${product.name} · ${design.name}`}
                              onChange={() => {
                                setPicks((now) =>
                                  toggleDesign(now, product.productId, designIds, design.designId),
                                );
                              }}
                            />
                            <Thumb src={design.image?.urls.thumbnail ?? null} />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-[15px] font-medium">
                                {design.name}
                              </span>
                              <span className="truncate text-[14px] text-fg-muted">
                                {design.heldBy ? (
                                  <StatusTag tone="warn">
                                    {t('of.heldBy', { name: design.heldBy.name })}
                                  </StatusTag>
                                ) : design.price ? (
                                  formatTaka(design.price)
                                ) : null}
                              </span>
                            </span>
                          </div>
                        ))
                      : null}
                  </div>
                );
              })}
              {list.hasNextPage ? (
                <button
                  type="button"
                  className="flex min-h-13 w-full items-center justify-center font-semibold text-primary"
                  onClick={() => {
                    void list.fetchNextPage();
                  }}
                >
                  {t('of.more')}
                </button>
              ) : null}
            </RowList>
          )}
        </div>
      </div>
    </Sheet>
  );
}
