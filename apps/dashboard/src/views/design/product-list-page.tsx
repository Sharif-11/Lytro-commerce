import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { StockState, StorefrontCardMode } from '@lytronix/validators';
import { useSaveCardOrder, useStorefrontCards } from '@/api/storefront-design';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { ShellPage } from '@/shell/shell-page';
import type { StorefrontCard, StorefrontCards } from '@/types/storefront-design';
import {
  cardKey,
  changesFrom,
  isCompact,
  isShown,
  modesOf,
  moveShown,
  moveToEnd,
  orderInput,
  type Modes,
} from './card-order';
import { Handle, NoteLine } from './design-parts';
import { EditorIcon } from './editor-icon';
import { dragPlace, useDragOrder } from './use-drag-order';

/**
 * Settings > Storefront > Design > Product list (STOREFRONT-BUILDER-PLAN DC-6 to DC-8, the sketch's `e-order`; the
 * owner named it): every card of the shop -- each design apart while design cards are on -- in the order category
 * pages and All products show them. A card moves by its handle, dragged on a computer or a phone, or with the arrow
 * keys; on a phone also by its arrows, and Move to top or bottom from its menu. A product with designs is shown as
 * its designs, one card, or both, from the same menu; its one card has a ground of its own. Save order makes it live.
 */
export function ProductListView(): React.JSX.Element {
  const cards = useStorefrontCards();
  if (!cards.data) {
    return (
      <ShellPage>
        {cards.isError ? (
          <ErrorBanner error={cards.error} />
        ) : (
          <Card flush>
            <SkeletonRows count={6} />
          </Card>
        )}
      </ShellPage>
    );
  }
  return <ProductListPage initial={cards.data} />;
}

function ProductListPage({ initial }: { initial: StorefrontCards }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const save = useSaveCardOrder();
  const toast = useToast();
  const [base, setBase] = useState(initial);
  const [order, setOrder] = useState<StorefrontCard[]>(initial.cards);
  const [modes, setModes] = useState<Modes>(() => modesOf(initial.cards));
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const modesRef = useRef(modes);
  useEffect(() => {
    modesRef.current = modes;
  }, [modes]);
  const leaving = useRef(false);

  const baseModes = useMemo(() => modesOf(base.cards), [base]);
  const shown = useMemo(() => order.filter((card) => isShown(card, modes)), [order, modes]);
  const changes = changesFrom(base.cards, baseModes, order, modes);
  const searching = query.trim() !== '';
  const listed = searching
    ? shown.filter((card) => card.name.toLowerCase().includes(query.trim().toLowerCase()))
    : shown;
  // How many designs each product spreads, for its one card's line.
  const designCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of order) {
      if (card.designId !== null) counts.set(card.productId, (counts.get(card.productId) ?? 0) + 1);
    }
    return counts;
  }, [order]);

  const blocker = useBlocker({
    shouldBlockFn: () => !leaving.current && changes > 0,
    enableBeforeUnload: () => !leaving.current && changes > 0,
    withResolver: true,
  });

  const moveTo = (from: number, to: number) => {
    setOrder((current) => moveShown(current, modesRef.current, from, to));
  };

  /** A card dragged by its handle moves to the place of the card under the pointer; the arrows move it one place. */
  const { dragging, startDrag, keyMove } = useDragOrder({
    disabled: searching,
    onOver: (key, to) => {
      setOrder((current) => {
        const visible = current.filter((each) => isShown(each, modesRef.current));
        const from = visible.findIndex((each) => cardKey(each) === key);
        return from < 0 || from === to ? current : moveShown(current, modesRef.current, from, to);
      });
    },
    onStep: moveTo,
  });

  function saveOrder(): void {
    save.mutate(orderInput(order, modes), {
      onSuccess: (saved) => {
        setBase(saved);
        setOrder(saved.cards);
        setModes(modesOf(saved.cards));
        toast.show(t('plSaved'));
      },
    });
  }

  const labelOf = (card: StorefrontCard) =>
    card.designNumber === null
      ? card.name
      : `${card.name}, ${t('plDesign', { n: card.designNumber })}`;
  const lineOf = (card: StorefrontCard) => {
    const kind =
      card.designNumber !== null
        ? `${t('plDesign', { n: card.designNumber })} · `
        : isCompact(card)
          ? `${t('plAllDesigns', { count: designCount.get(card.productId) ?? 0 })} · `
          : '';
    return `${kind}${card.price === null ? '' : formatTaka(card.price)}`;
  };
  const tagOf = (card: StorefrontCard) =>
    !card.active ? (
      <StatusTag tone="neutral" small>
        {t('plHidden')}
      </StatusTag>
    ) : card.stockState === StockState.Out ? (
      <StatusTag tone="neutral" small>
        {t('plSoldOut')}
      </StatusTag>
    ) : null;
  // The phone's list and the computer's grid both hold a card's menu, one of them hidden: each opens on its own.
  const menuFor = (card: StorefrontCard, at: number, place: 'list' | 'grid') => (
    <CardMenu
      card={card}
      label={labelOf(card)}
      open={menu === `${place}:${cardKey(card)}`}
      mode={modes[card.productId] ?? null}
      onOpen={(open) => {
        setMenu(open ? `${place}:${cardKey(card)}` : null);
      }}
      onEnd={(end) => {
        setOrder((current) => moveToEnd(current, modesRef.current, at, end));
        setMenu(null);
      }}
      onMode={(mode) => {
        setModes((current) => ({ ...current, [card.productId]: mode }));
        setMenu(null);
      }}
    />
  );
  // A card's place among the shown ones, which is what moves and what the number says.
  const placeOf = (card: StorefrontCard) => shown.indexOf(card);

  const moved =
    changes > 0 ? <StatusTag tone="warn">{t('plMoved', { count: changes })}</StatusTag> : null;
  const empty =
    listed.length === 0 ? (
      <p className="py-4 text-center text-[14px] text-fg-muted">
        {t(searching ? 'plNoMatch' : 'plNone')}
      </p>
    ) : null;

  return (
    <ShellPage actions={moved}>
      {save.isError ? <ErrorBanner error={save.error} /> : null}
      <div className="flex flex-col gap-section lg:grid lg:grid-cols-[430px_1fr] lg:items-start lg:gap-columns">
        <div className="flex flex-col gap-3">
          <NoteLine>{t('plNote')}</NoteLine>
          <div className="flex">
            <SearchField
              value={query}
              onChange={setQuery}
              label={t('plFind')}
              placeholder={t('plFind')}
            />
          </div>
          {searching ? <p className="text-[13px] text-fg-muted">{t('plSearching')}</p> : null}
          <Card className="hidden lg:block">
            <h2 className="text-[15.5px] font-bold">{t('plHowTitle')}</h2>
            <p className="mt-[3px] text-[13px] text-fg-muted">{t('plHow')}</p>
          </Card>
          {/* A phone: the cards as a list. */}
          <Card className="px-3 py-1.5 lg:hidden">
            <ul>
              {listed.map((card) => {
                const at = placeOf(card);
                return (
                  <li
                    key={cardKey(card)}
                    {...dragPlace(at)}
                    className={`relative flex min-h-[64px] items-center gap-2 border-t border-neutral-100 py-2 first:border-t-0 ${isCompact(card) ? '-mx-1.5 rounded-[10px] bg-primary-soft px-1.5' : ''} ${dragging === cardKey(card) ? 'opacity-60' : ''} ${card.active && card.stockState !== StockState.Out ? '' : 'text-fg-muted'}`}
                  >
                    <Handle
                      label={t('plDrag', { name: labelOf(card) })}
                      disabled={searching}
                      onPointerDown={(event) => {
                        startDrag(event, cardKey(card));
                      }}
                      onKeyDown={(event) => {
                        keyMove(event, at, shown.length);
                      }}
                    />
                    <span className="flex w-6 flex-none flex-col items-center text-neutral-500">
                      <button
                        type="button"
                        aria-label={t('sdMoveUp', { name: labelOf(card) })}
                        disabled={searching || at === 0}
                        onClick={() => {
                          moveTo(at, at - 1);
                        }}
                        className="grid h-[22px] w-6 place-items-center disabled:opacity-35"
                      >
                        <EditorIcon name="up" size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={t('sdMoveDown', { name: labelOf(card) })}
                        disabled={searching || at === shown.length - 1}
                        onClick={() => {
                          moveTo(at, at + 1);
                        }}
                        className="grid h-[22px] w-6 place-items-center disabled:opacity-35"
                      >
                        <EditorIcon name="down" size={16} />
                      </button>
                    </span>
                    <Picture card={card} className="h-[55px] w-11 rounded-[8px]" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] font-bold">{card.name}</b>
                      <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-muted">
                        {lineOf(card)}
                        {tagOf(card)}
                      </span>
                    </span>
                    <span className="w-5 text-right text-[13px] font-semibold text-neutral-500">
                      {at + 1}
                    </span>
                    {menuFor(card, at, 'list')}
                  </li>
                );
              })}
            </ul>
            {empty}
          </Card>
        </div>
        {/* A computer: the cards as the shop lays them out. */}
        <div className="hidden flex-col gap-3 rounded-card bg-[#e7ecec] px-6 py-[18px] lg:flex">
          <b className="text-[13px] text-fg">{t('plPane')}</b>
          <div className="grid grid-cols-3 gap-3.5 xl:grid-cols-4">
            {listed.map((card) => {
              const at = placeOf(card);
              const lifted = dragging === cardKey(card);
              return (
                <div
                  key={cardKey(card)}
                  {...dragPlace(at)}
                  className={`relative rounded-[12px] border p-2 ${isCompact(card) ? 'bg-primary-soft' : 'bg-surface'} ${lifted ? '-translate-y-1.5 -rotate-2 border-primary shadow-[0_14px_30px_rgba(0,0,0,0.22)]' : 'border-line'} ${card.active && card.stockState !== StockState.Out ? '' : 'opacity-75'}`}
                >
                  <span className="absolute top-3 left-3 z-[1] rounded-[8px] bg-white/90 px-[7px] py-0.5 text-[12px] font-bold">
                    {at + 1}
                  </span>
                  <span className="absolute top-3 right-3 z-[1] rounded-[8px] bg-white/90">
                    <Handle
                      label={t('plDrag', { name: labelOf(card) })}
                      disabled={searching}
                      onPointerDown={(event) => {
                        startDrag(event, cardKey(card));
                      }}
                      onKeyDown={(event) => {
                        keyMove(event, at, shown.length);
                      }}
                    />
                  </span>
                  <Picture card={card} className="aspect-[4/5] w-full rounded-[8px]" />
                  <div className="mt-1.5 truncate text-[13px] font-semibold">{card.name}</div>
                  <div className="truncate text-[12px] text-fg-muted">{lineOf(card)}</div>
                  <div className="mt-1 flex min-h-6 items-center justify-between gap-1">
                    <span>{tagOf(card)}</span>
                    {menuFor(card, at, 'grid')}
                  </div>
                </div>
              );
            })}
          </div>
          {empty}
        </div>
      </div>
      <ActionBar>
        <Button
          busy={save.isPending}
          disabled={changes === 0 || save.isPending}
          onClick={saveOrder}
        >
          {t('plSave')}
        </Button>
      </ActionBar>
      <Dialog
        open={blocker.status === 'blocked'}
        title={t('lvTitle', { ns: 'shop' })}
        onClose={() => {
          if (blocker.status === 'blocked') blocker.reset();
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                if (blocker.status === 'blocked') blocker.reset();
              }}
            >
              {t('lvStay', { ns: 'shop' })}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                leaving.current = true;
                if (blocker.status === 'blocked') blocker.proceed();
              }}
            >
              {t('lvLeave', { ns: 'shop' })}
            </Button>
          </>
        }
      >
        {t('plLeave')}
      </Dialog>
      <Toast message={toast.message} />
    </ShellPage>
  );
}

function Picture({ card, className }: { card: StorefrontCard; className: string }) {
  return card.image ? (
    <img
      src={card.image.urls.thumbnail}
      alt=""
      draggable={false}
      className={`flex-none object-cover ${className}`}
    />
  ) : (
    <span className={`block flex-none bg-neutral-100 ${className}`} />
  );
}

const MODES: readonly { mode: StorefrontCardMode; words: string }[] = [
  { mode: StorefrontCardMode.Designs, words: 'plModeDesigns' },
  { mode: StorefrontCardMode.Compact, words: 'plModeCompact' },
  { mode: StorefrontCardMode.Both, words: 'plModeBoth' },
];

/** A card's "⋯" menu: to the top or the bottom, and how its product shows (DC-8), for a product with designs. */
function CardMenu({
  card,
  label,
  open,
  mode,
  onOpen,
  onEnd,
  onMode,
}: {
  card: StorefrontCard;
  label: string;
  open: boolean;
  mode: StorefrontCardMode | null;
  onOpen: (open: boolean) => void;
  onEnd: (end: 'top' | 'bottom') => void;
  onMode: (mode: StorefrontCardMode) => void;
}) {
  const { t } = useTranslation('menu');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onOpen]);
  const item =
    'flex w-full items-center gap-2 rounded-[8px] px-3 py-[9px] text-left hover:bg-neutral-50';
  return (
    <div ref={box} className="relative flex-none">
      <button
        type="button"
        aria-label={t('plMore', { name: label })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          onOpen(!open);
        }}
        className="grid size-8 place-items-center rounded-[8px] text-neutral-500"
      >
        <EditorIcon name="more" size={20} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-full right-0 z-20 mt-1 min-w-[200px] rounded-[12px] bg-surface p-1.5 text-[14px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              onEnd('top');
            }}
          >
            {t('plTop')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              onEnd('bottom');
            }}
          >
            {t('plBottom')}
          </button>
          {card.mode !== null && mode !== null ? (
            <>
              <div className="mx-1.5 my-1 border-t border-neutral-100 px-1.5 pt-2 text-[12px] text-fg-muted">
                {t('plShowAs')}
              </div>
              {MODES.map((each) => (
                <button
                  key={each.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mode === each.mode}
                  className={item}
                  onClick={() => {
                    onMode(each.mode);
                  }}
                >
                  <span className="grid w-4 place-items-center text-primary">
                    {mode === each.mode ? <Icon name="check" size={16} /> : null}
                  </span>
                  {t(each.words)}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
