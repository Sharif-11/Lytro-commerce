import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { ProductKind } from '@lytronix/validators';
import { useOrderPicker, useOrderPickerProduct } from '@/api/orders';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CheckBox } from '@/components/ui/check-row';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useErrorText } from '@/hooks/use-error-text';
import type { OrderPickerItem, OrderPickerProduct, PickerModifierGroup } from '@/types/orders';
import { amountOf, type DraftLine } from './order-draft';

const TYPING_REST_MS = 250;

/** A row's 48 px picture (the prototype's `.thumb`). */
function Thumb({ image }: { image: string | null }): React.JSX.Element {
  return (
    <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-button bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400">
      {image ? (
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        <Icon name="image" />
      )}
    </span>
  );
}

/** The units on sale under a price: "24 left", "Out of stock" in red, nothing when made to order. */
function Units({ available }: { available: string | null }): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  if (available === null) return null;
  const count = Number(available);
  return (
    <span className="num text-[13px] text-fg-subtle">
      {count > 0 ? t('left', { count }) : <span className="text-danger">{t('outOfStock')}</span>}
    </span>
  );
}

/** A tappable row with a price and its units at the end (the prototype's `.row` with `.trail`). */
function PickRow({
  image,
  title,
  sub,
  price,
  available,
  onPick,
}: {
  image?: string | null;
  title: React.ReactNode;
  sub?: string;
  price: string;
  available: string | null;
  onPick: () => void;
}): React.JSX.Element {
  const gone = available !== null && Number(available) <= 0;
  return (
    <button
      type="button"
      disabled={gone}
      onClick={onPick}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left ${gone ? 'opacity-55' : ''}`}
    >
      {image === undefined ? null : <Thumb image={image} />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">{title}</span>
        {sub ? <span className="text-[14px] text-fg-muted">{sub}</span> : null}
      </span>
      <span className="flex flex-none flex-col items-end gap-1 text-right">
        <span className="num text-[16px] font-semibold">{price}</span>
        <Units available={available} />
      </span>
    </button>
  );
}

/** Where Add an item is: the search, or one product's variants and choices. */
type Step =
  { kind: 'search' } | { kind: 'product'; item: OrderPickerItem; variantId: string | null };

/**
 * New order's Add an item (Part 29's `o29-add-item`, `o29-add-variant`, `o29-combo-pick` and `o29-add-ons`; agreed in
 * the a3 read): products searched by name, each with its units on sale; a product with variants tapped, then one of
 * them with its price and units; a combo's choices and an ordinary product's add-on groups asked after. One line a tap.
 */
export function AddItemSheets({
  open,
  onAdd,
  onClose,
}: {
  open: boolean;
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'search' });
  // Kept while a product is open, so going back finds the search as it was.
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep({ kind: 'search' });
    setTyped('');
  }, [open]);

  const add = (line: DraftLine) => {
    onAdd(line);
    onClose();
  };

  if (open && step.kind === 'product') {
    return (
      <ProductSheet
        item={step.item}
        variantId={step.variantId}
        onVariant={(variantId) => {
          setStep({ ...step, variantId });
        }}
        onAdd={add}
        onBack={() => {
          setStep(
            step.variantId !== null && step.item.variantCount > 1
              ? { ...step, variantId: null }
              : { kind: 'search' },
          );
        }}
        onClose={onClose}
      />
    );
  }
  return (
    <SearchSheet
      open={open}
      typed={typed}
      onType={setTyped}
      onPick={(item) => {
        setStep({ kind: 'product', item, variantId: null });
      }}
      onClose={onClose}
    />
  );
}

/** The search (`o29-add-item`): the shop's products by name, 20 at a time. */
function SearchSheet({
  open,
  typed,
  onType,
  onPick,
  onClose,
}: {
  open: boolean;
  typed: string;
  onType: (typed: string) => void;
  onPick: (item: OrderPickerItem) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const search = useDebouncedValue(typed.trim(), TYPING_REST_MS);
  const found = useOrderPicker(search, { enabled: open });
  const items = (found.data?.pages ?? []).flatMap((page) => page.products);
  return (
    <Sheet open={open} title={t('addItem')} onClose={onClose}>
      <div className="flex items-center gap-2">
        <SearchField
          value={typed}
          onChange={onType}
          placeholder={t('searchProduct')}
          label={t('searchProduct')}
        />
      </div>
      {found.isError ? <Banner tone="bad">{errorText(found.error)}</Banner> : null}
      {found.isPending ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <p className="text-[14px] text-fg-muted">{t('noProducts')}</p>
      ) : (
        <RowList>
          {items.map((item) => (
            <PickRow
              key={item.id}
              image={item.image}
              title={
                item.kind === ProductKind.Combo ? (
                  <>
                    {item.name} <StatusTag tone="neutral">{t('combo')}</StatusTag>
                  </>
                ) : (
                  item.name
                )
              }
              sub={item.variantCount > 1 ? t('variantsN', { count: item.variantCount }) : undefined}
              // Its lowest price, as drawn; each variant's own is on the next step.
              price={formatTaka(item.minPrice)}
              available={item.available}
              onPick={() => {
                onPick(item);
              }}
            />
          ))}
        </RowList>
      )}
      {found.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={found.isFetchingNextPage}
          onClick={() => {
            void found.fetchNextPage();
          }}
        >
          {t('showMore')}
        </Button>
      ) : null}
    </Sheet>
  );
}

/** A line made from the product, its variant, and what was chosen for it. */
function lineOf(
  product: OrderPickerProduct,
  variant: OrderPickerProduct['variants'][number],
  extra: Pick<DraftLine, 'choices' | 'choiceText' | 'modifiers' | 'modifierText'> & {
    plus: number;
  },
): DraftLine {
  return {
    key: crypto.randomUUID(),
    lineId: null,
    variantId: variant.variantId,
    productName: product.name,
    label: variant.label,
    combo: product.kind === ProductKind.Combo,
    base: variant.price,
    price: (Number(variant.price) + extra.plus).toFixed(2),
    byHand: null,
    quantity: 1,
    available: variant.available,
    choices: extra.choices,
    choiceText: extra.choiceText,
    modifiers: extra.modifiers,
    modifierText: extra.modifierText,
  };
}

/** One product: its variants (`o29-add-variant`), then a combo's choices or the add-ons when it has any. */
function ProductSheet({
  item,
  variantId,
  onVariant,
  onAdd,
  onBack,
  onClose,
}: {
  item: OrderPickerItem;
  variantId: string | null;
  onVariant: (variantId: string) => void;
  onAdd: (line: DraftLine) => void;
  onBack: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const found = useOrderPickerProduct(item.id);
  const product = found.data;
  const asks =
    product !== undefined &&
    (product.kind === ProductKind.Combo || product.modifierGroups.length > 0);
  const only = product?.variants.length === 1 ? product.variants[0] : undefined;
  const chosen = product?.variants.find(
    (each) => each.variantId === (variantId ?? only?.variantId),
  );

  // A product with one variant and nothing to ask is added as it is tapped.
  useEffect(() => {
    if (product && only && !asks) {
      onAdd(
        lineOf(product, only, {
          choices: null,
          choiceText: null,
          modifiers: null,
          modifierText: null,
          plus: 0,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  if (product && chosen && asks) {
    return (
      <ChoicesSheet
        product={product}
        variant={chosen}
        onAdd={onAdd}
        onBack={onBack}
        onClose={onClose}
      />
    );
  }
  return (
    <Sheet open title={item.name} onBack={onBack} onClose={onClose}>
      {found.isError ? <Banner tone="bad">{errorText(found.error)}</Banner> : null}
      {!product || only ? (
        <SkeletonRows count={3} />
      ) : (
        <>
          <p className="-mt-1 mb-2 text-[14px]">{t('pickVariant')}</p>
          <RowList>
            {product.variants.map((variant) => (
              <PickRow
                key={variant.variantId}
                title={variant.label}
                price={formatTaka(variant.price)}
                available={variant.available}
                onPick={() => {
                  if (asks) onVariant(variant.variantId);
                  else
                    onAdd(
                      lineOf(product, variant, {
                        choices: null,
                        choiceText: null,
                        modifiers: null,
                        modifierText: null,
                        plus: 0,
                      }),
                    );
                }}
              />
            ))}
          </RowList>
        </>
      )}
    </Sheet>
  );
}

/** What a group has chosen: its defaults to begin with (MNU-02). */
function defaultsOf(groups: PickerModifierGroup[]): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    ]),
  );
}

/**
 * A combo's choices and add-ons (`o29-combo-pick`), or an ordinary product's add-ons (`o29-add-ons`): a variant for each
 * unit of each choice part, out-of-stock ones greyed; each add-on group as chips when one is picked, ticks when more
 * may be, a required group marked. Added once every unit is chosen and each group has what it needs.
 */
function ChoicesSheet({
  product,
  variant,
  onAdd,
  onBack,
  onClose,
}: {
  product: OrderPickerProduct;
  variant: OrderPickerProduct['variants'][number];
  onAdd: (line: DraftLine) => void;
  onBack: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const choiceParts = product.parts.filter((part) => part.variants.length > 1);
  const fixed = product.parts.filter((part) => part.variants.length === 1);
  const [units, setUnits] = useState<Record<number, (string | null)[]>>(() =>
    Object.fromEntries(
      choiceParts.map((part) => [
        part.position,
        Array.from({ length: Number(part.quantity) }, () => null),
      ]),
    ),
  );
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    defaultsOf(product.modifierGroups),
  );
  const options = product.modifierGroups.flatMap((group) => group.options);
  const plus = product.modifierGroups.reduce(
    (sum, group) =>
      sum +
      (picked[group.id] ?? []).reduce(
        (each, id) => each + Number(options.find((option) => option.id === id)?.priceChange ?? 0),
        0,
      ),
    0,
  );
  const unitsDone = choiceParts.every((part) =>
    (units[part.position] ?? []).every((each) => each !== null),
  );
  const groupsDone = product.modifierGroups.every((group) => {
    const count = (picked[group.id] ?? []).length;
    return count >= group.minSelect && count <= group.maxSelect;
  });
  const labelOf = (part: OrderPickerProduct['parts'][number], id: string) =>
    part.variants.find((each) => each.variantId === id);
  const named = (each: { productName: string; label: string }) =>
    [each.productName, each.label].filter(Boolean).join(' · ');

  const add = () => {
    const choices = choiceParts.map((part) => ({
      part: part.position,
      variantIds: (units[part.position] ?? []).flatMap((each) => (each ? [each] : [])),
    }));
    const choiceText = [
      ...choiceParts.flatMap((part) =>
        (units[part.position] ?? []).flatMap((id) => {
          const each = id ? labelOf(part, id) : undefined;
          return each ? [named(each)] : [];
        }),
      ),
      ...fixed.flatMap((part) => part.variants.map(named)),
    ].join(', ');
    const chosen = product.modifierGroups.flatMap((group) =>
      (picked[group.id] ?? []).flatMap((id) => {
        const option = group.options.find((each) => each.id === id);
        return option ? [option] : [];
      }),
    );
    onAdd(
      lineOf(product, variant, {
        choices: choiceParts.length > 0 ? choices : null,
        choiceText: product.kind === ProductKind.Combo ? choiceText : null,
        modifiers:
          product.modifierGroups.length > 0
            ? product.modifierGroups.map((group) => ({
                groupId: group.id,
                optionIds: picked[group.id] ?? [],
              }))
            : null,
        modifierText:
          chosen.length > 0
            ? chosen
                .map((option) =>
                  Number(option.priceChange) === 0
                    ? option.name
                    : `${option.name} +${formatTaka(option.priceChange)}`,
                )
                .join(', ')
            : null,
        plus,
      }),
    );
  };

  const toggle = (group: PickerModifierGroup, id: string) => {
    const now = picked[group.id] ?? [];
    const next = now.includes(id)
      ? now.filter((each) => each !== id)
      : group.maxSelect === 1
        ? [id]
        : [...now, id];
    setPicked({ ...picked, [group.id]: next });
  };

  // The prototype's sheet headings (`.sb h3`): each after the first sits 16 px further down.
  let headings = 0;
  const heading = (children: React.ReactNode, key: string) => (
    <h3
      key={key}
      className={`mb-2 flex flex-wrap items-center gap-1.5 text-[16.38px] font-bold ${headings++ > 0 ? 'mt-4' : ''}`}
    >
      {children}
    </h3>
  );

  return (
    <Sheet
      open
      title={`${[product.name, variant.label].filter(Boolean).join(' · ')} · ${formatTaka(variant.price)}`}
      onBack={onBack}
      onClose={onClose}
      footer={
        <Button wide disabled={!unitsDone || !groupsDone} onClick={add}>
          {`${t('addToOrder')} · ${formatTaka(Number(variant.price) + plus)}`}
        </Button>
      }
    >
      {fixed.length > 0 ? (
        <p className="-mt-1 mb-3 text-[14px]">
          {t('comboFixed', { items: fixed.flatMap((part) => part.variants.map(named)).join(', ') })}
        </p>
      ) : null}
      {choiceParts.flatMap((part) => [
        heading(
          t('pickEach', { product: part.variants[0]?.productName ?? '' }),
          `part-${String(part.position)}`,
        ),
        ...(units[part.position] ?? []).map((unit, index) => (
          <div
            key={`${String(part.position)}-${String(index)}`}
            className="flex flex-wrap items-center gap-2"
          >
            {(units[part.position] ?? []).length > 1 ? (
              <span className="num w-6 text-[14px] text-fg-muted">{index + 1}.</span>
            ) : null}
            {part.variants.map((each) => {
              const gone = !each.onSale || (each.available !== null && Number(each.available) <= 0);
              return (
                <Chip
                  key={each.variantId}
                  on={unit === each.variantId}
                  disabled={gone}
                  onClick={() => {
                    const next = [...(units[part.position] ?? [])];
                    next[index] = each.variantId;
                    setUnits({ ...units, [part.position]: next });
                  }}
                >
                  {gone ? (
                    <span className="text-fg-subtle">
                      {each.label || each.productName} · {t('outOfStock')}
                    </span>
                  ) : (
                    each.label || each.productName
                  )}
                </Chip>
              );
            })}
          </div>
        )),
      ])}
      {product.modifierGroups.flatMap((group) => [
        heading(
          <>
            {group.name}
            {group.minSelect > 0 ? (
              <StatusTag tone="warn">{t('required')}</StatusTag>
            ) : group.maxSelect > 1 ? (
              <span className="font-normal">· {t('upTo', { count: group.maxSelect })}</span>
            ) : null}
          </>,
          `group-${group.id}`,
        ),
        ...(group.minSelect >= 1 && group.maxSelect === 1
          ? [
              <div key={`chips-${group.id}`} className="flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <Chip
                    key={option.id}
                    on={(picked[group.id] ?? []).includes(option.id)}
                    onClick={() => {
                      toggle(group, option.id);
                    }}
                  >
                    {option.name}
                    {Number(option.priceChange) === 0 ? null : (
                      <span className="num"> +{formatTaka(option.priceChange)}</span>
                    )}
                  </Chip>
                ))}
              </div>,
            ]
          : group.options.map((option) => {
              const on = (picked[group.id] ?? []).includes(option.id);
              const full =
                !on && group.maxSelect > 1 && (picked[group.id] ?? []).length >= group.maxSelect;
              return (
                <label
                  key={option.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px]"
                >
                  <CheckBox
                    checked={on}
                    disabled={full}
                    onChange={() => {
                      toggle(group, option.id);
                    }}
                  />
                  <span className="flex-1 text-[15px] font-medium">{option.name}</span>
                  {Number(option.priceChange) === 0 ? null : (
                    <span className="num">+{formatTaka(option.priceChange)}</span>
                  )}
                </label>
              );
            })),
      ])}
    </Sheet>
  );
}

/** A line's Change price (`o29-line-price`, ORD-06): the price for each, the one it showed under it. */
export function PriceSheet({
  line,
  onSave,
  onClose,
}: {
  line: DraftLine;
  onSave: (byHand: string | null) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const [typed, setTyped] = useState(line.byHand ?? String(Number(line.price)));
  const amount = amountOf(typed);
  return (
    <Sheet
      open
      title={t('priceByHand')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={amount === null}
          onClick={() => {
            onSave(amount === null || amount === Number(line.price) ? null : typed.trim());
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <p className="-mt-1 mb-3 text-[14px]">
        {[line.productName, line.label].filter(Boolean).join(' · ')}
      </p>
      <Field
        label={t('priceEach')}
        prefix="৳"
        inputMode="decimal"
        value={typed}
        help={t('priceWas', { price: formatTaka(line.price) })}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
    </Sheet>
  );
}
