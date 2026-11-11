import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { RowList, RowText } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import {
  isSamePlace,
  KeyboardPlaces,
  lineOf,
  placeAfter,
  placeBefore,
  placeInside,
  refusalOf,
  subtreeOf,
  treeOrder,
  type CategoryPlace,
  type MoveRefusal,
} from '@/lib/category-tree';
import type { CategorySummary } from '@/types/catalogue';

/** Where a drop lands, as drawn: inside a row (its outline), or a line between rows; with why it can't, if it can't. */
interface Target {
  place: CategoryPlace;
  /** The row it would go inside; null for a line. */
  into: string | null;
  refusal: MoveRefusal | null;
}

/** A drag by the mouse: the category held, where the pointer is, and where it would land. */
interface PointerDrag {
  id: string;
  x: number;
  y: number;
  target: Target | null;
}

/** A move by the keyboard: the category held, and the spot and level the line is at (KeyboardPlaces). */
interface KeyMove {
  id: string;
  spot: number;
  depth: number;
}

// A pointer this far from where it went down starts a drag; less is a press.
const DRAG_START_PX = 4;
// Near a row's top or bottom edge, before or after it; its middle, inside it.
const EDGE = 0.3;

/**
 * Categories by dragging (D8-72, Part 39's `p88-cat` group): the tree, each row with a grip on a computer. Dropped on a
 * row's middle a category goes inside it, last; near its top or bottom edge before or after it, with a line where it
 * lands; a drop the rules refuse says why where it would land. The grip does the same by the keyboard: Space picks the
 * category up, the arrows move the line, Space drops it and Esc puts it back, each step read out. A phone keeps the ⋯
 * menu (Move up, Move down, Move to…). Uncategorized neither moves nor takes one.
 */
export function CategoryRows({
  categories,
  unfiled,
  mayManage,
  fresh,
  typeName,
  onEdit,
  onMenu,
  onVisible,
  onMove,
}: {
  categories: readonly CategorySummary[];
  /** Products filed in none. */
  unfiled: number;
  mayManage: boolean;
  /** The row just added or moved. */
  fresh: { id: string; added: boolean } | null;
  typeName: (key: string) => string;
  onEdit: (category: CategorySummary) => void;
  onMenu: (category: CategorySummary) => void;
  onVisible: (category: CategorySummary, visible: boolean) => void;
  onMove: (category: CategorySummary, place: CategoryPlace) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const rows = treeOrder(categories);
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const pressed = useRef<{ id: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<PointerDrag | null>(null);
  const [keys, setKeys] = useState<KeyMove | null>(null);
  const [said, setSaid] = useState('');

  const nameOf = (id: string | null) =>
    id === null ? '' : (categories.find((each) => each.id === id)?.name ?? '');
  const byId = (id: string) => categories.find((each) => each.id === id);
  const why = (refusal: MoveRefusal) => (refusal === 'deep' ? t('p88cat.deep') : t('p88cat.self'));

  /** What a place means, read out: the parent and the one it follows. */
  const where = (place: CategoryPlace) => {
    const a = nameOf(place.afterId);
    if (place.parentId === null) {
      return place.afterId === null ? t('p88cat.keysTopFirst') : t('p88cat.keysTopAfter', { a });
    }
    const p = nameOf(place.parentId);
    return place.afterId === null
      ? t('p88cat.keysInFirst', { p })
      : t('p88cat.keysInAfter', { p, a });
  };

  /** Where a drop over a row lands, by how far down the row the pointer is. */
  function targetAt(id: string, clientY: number): Target | null {
    for (const { category } of rows) {
      const box = rowEls.current.get(category.id)?.getBoundingClientRect();
      if (!box || clientY < box.top || clientY >= box.bottom) continue;
      if (category.id === id) return null;
      const share = (clientY - box.top) / box.height;
      const hasChildren = categories.some(
        (each) => each.parentId === category.id && each.id !== id,
      );
      let place: CategoryPlace;
      let into: string | null = null;
      if (share < EDGE) {
        place = placeBefore(categories, id, category.id);
      } else if (share > 1 - EDGE) {
        // Below a row with sub-categories is their first place; below one without, after it.
        place = hasChildren
          ? { parentId: category.id, afterId: null }
          : placeAfter(categories, category.id);
      } else {
        place = placeInside(categories, id, category.id);
        into = category.id;
      }
      if (isSamePlace(categories, id, place)) return null;
      return { place, into, refusal: refusalOf(categories, id, place.parentId) };
    }
    return null;
  }

  function cancel(): void {
    pressed.current = null;
    setDrag(null);
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>, id: string): void {
    if (event.button !== 0 || keys) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = { id, x: event.clientX, y: event.clientY };
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>): void {
    const start = pressed.current;
    if (!start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (!drag && moved < DRAG_START_PX) return;
    setDrag({
      id: start.id,
      x: event.clientX,
      y: event.clientY,
      target: targetAt(start.id, event.clientY),
    });
  }

  function pointerUp(): void {
    const held = drag;
    cancel();
    const category = held ? byId(held.id) : undefined;
    if (!held?.target || held.target.refusal !== null || !category) return;
    onMove(category, held.target.place);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, category: CategorySummary): void {
    if (drag) {
      if (event.key === 'Escape') cancel();
      return;
    }
    const places = new KeyboardPlaces(categories, category.id);
    if (!keys) {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      const start = places.start();
      setKeys({ id: category.id, ...start });
      setSaid(t('p88cat.keys', { c: category.name }));
      return;
    }
    let next = keys;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        const spot = Math.min(
          places.spots,
          Math.max(0, keys.spot + (event.key === 'ArrowUp' ? -1 : 1)),
        );
        next = { ...keys, spot, depth: places.depths(spot).min };
        break;
      }
      case 'ArrowRight':
      case 'ArrowLeft': {
        const { min, max } = places.depths(keys.spot);
        const depth = keys.depth + (event.key === 'ArrowRight' ? 1 : -1);
        next = { ...keys, depth: Math.min(max, Math.max(min, depth)) };
        break;
      }
      case ' ':
      case 'Enter': {
        event.preventDefault();
        const place = places.placeAt(keys.spot, keys.depth);
        const refusal = refusalOf(categories, category.id, place.parentId);
        if (refusal !== null) {
          setSaid(why(refusal));
          return;
        }
        setKeys(null);
        setSaid('');
        if (!isSamePlace(categories, category.id, place)) onMove(category, place);
        return;
      }
      case 'Escape':
        event.preventDefault();
        setKeys(null);
        setSaid(t('p88cat.keysCancelled', { c: category.name }));
        return;
      default:
        return;
    }
    event.preventDefault();
    setKeys(next);
    const place = places.placeAt(next.spot, next.depth);
    const refusal = refusalOf(categories, category.id, place.parentId);
    setSaid(refusal === null ? where(place) : why(refusal));
  }

  // What is held, what it would land on, and the line's place in the list.
  const heldId = drag?.id ?? keys?.id ?? null;
  const lifted = heldId === null ? new Set<string>() : subtreeOf(categories, heldId);
  let target: Target | null = drag?.target ?? null;
  if (keys) {
    const place = new KeyboardPlaces(categories, keys.id).placeAt(keys.spot, keys.depth);
    target = isSamePlace(categories, keys.id, place)
      ? null
      : { place, into: null, refusal: refusalOf(categories, keys.id, place.parentId) };
  }
  const line = target && target.into === null ? lineOf(categories, target.place) : null;
  const lineAt = (index: number): ReactNode =>
    line && target && line.index === index ? (
      <DropLine depth={line.depth} refusal={target.refusal === null ? null : why(target.refusal)} />
    ) : null;

  return (
    <>
      {keys ? (
        <Banner tone="info">{t('p88cat.keys', { c: nameOf(keys.id) })}</Banner>
      ) : mayManage ? (
        <p className="m-0 hidden text-[14px] text-fg-muted lg:block">{t('p88cat.lead')}</p>
      ) : null}
      <Card flush>
        <RowList>
          {rows.map(({ category, depth }, index) => {
            const into = target?.into === category.id ? target : null;
            const shade = into
              ? into.refusal === null
                ? 'bg-primary-soft outline-2 -outline-offset-2 outline-primary'
                : 'bg-danger-soft outline-2 -outline-offset-2 outline-danger outline-dashed'
              : fresh?.id === category.id
                ? 'bg-primary-soft'
                : '';
            return (
              <div
                key={category.id}
                ref={(element) => {
                  if (element) rowEls.current.set(category.id, element);
                  else rowEls.current.delete(category.id);
                }}
                className={[
                  'relative flex min-h-14 items-center gap-3 py-3 pr-4',
                  shade,
                  lifted.has(category.id) ? 'opacity-45' : '',
                ].join(' ')}
                style={{ paddingLeft: `${String(16 + (depth - 1) * 28)}px` }}
              >
                {lineAt(index)}
                {mayManage ? (
                  <button
                    type="button"
                    aria-label={t('p88cat.grip', { name: category.name })}
                    aria-pressed={keys?.id === category.id}
                    onPointerDown={(event) => {
                      pointerDown(event, category.id);
                    }}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={cancel}
                    onKeyDown={(event) => {
                      keyDown(event, category);
                    }}
                    onBlur={() => {
                      if (keys?.id === category.id) setKeys(null);
                    }}
                    className="-mx-1 hidden flex-none cursor-grab touch-none rounded-[6px] p-1 text-neutral-500 lg:inline-flex"
                  >
                    <Icon name="grip" />
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!mayManage}
                  onClick={() => {
                    onEdit(category);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                >
                  {depth > 1 ? <span className="text-neutral-300">└</span> : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <RowText
                      title={
                        <>
                          {category.name}
                          {category.visible ? null : (
                            <>
                              {' '}
                              <StatusTag tone="neutral">{t('hidden')}</StatusTag>
                            </>
                          )}
                          {category.behavesLike ? (
                            <>
                              {' '}
                              <StatusTag tone="info">
                                {t('behaves', { type: typeName(category.behavesLike) })}
                              </StatusTag>
                            </>
                          ) : null}
                          {fresh?.id === category.id && fresh.added ? (
                            <>
                              {' '}
                              <StatusTag tone="ok">{t('freshTag')}</StatusTag>
                            </>
                          ) : null}
                        </>
                      }
                      sub={t('productsN', { count: category.productCount })}
                    />
                    {into ? (
                      <DropTag ok={into.refusal === null}>
                        {into.refusal === null
                          ? t('p88cat.into', { p: category.name })
                          : why(into.refusal)}
                      </DropTag>
                    ) : null}
                  </span>
                </button>
                <span className="flex flex-none items-center gap-1">
                  <span className="flex scale-[.85]">
                    <Switch
                      checked={category.visible}
                      disabled={!mayManage}
                      label={t('catVisible')}
                      onChange={(visible) => {
                        onVisible(category, visible);
                      }}
                    />
                  </span>
                  {mayManage ? (
                    <button
                      type="button"
                      aria-label={t('catMore', { name: category.name })}
                      aria-haspopup="dialog"
                      onClick={() => {
                        onMenu(category);
                      }}
                      className="inline-flex size-9 items-center justify-center rounded-[8px] text-neutral-700 lg:hidden"
                    >
                      <Icon name="more" />
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
          <div className="relative flex min-h-14 items-center gap-3 px-4 py-3">
            {lineAt(rows.length)}
            <RowText title={t('uncategorized')} sub={t('productsN', { count: unfiled })} />
          </div>
        </RowList>
      </Card>
      {drag ? (
        <span
          aria-hidden="true"
          className="pointer-events-none fixed z-50 flex -rotate-2 items-center gap-2 rounded-[8px] border border-line-strong bg-surface px-3 py-2 text-[15px] font-semibold whitespace-nowrap shadow-[0_8px_24px_rgba(16,32,31,0.16)]"
          style={{ left: drag.x + 12, top: drag.y - 18 }}
        >
          <Icon name="grip" />
          {nameOf(drag.id)}
        </span>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </>
  );
}

/** The line where a category will land (Part 39's `.p88line`), its level's indent in; red with why, if it can't. */
function DropLine({
  depth,
  refusal,
}: {
  depth: number;
  refusal: string | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const tone = refusal === null ? 'border-primary' : 'border-danger border-dashed';
  const fill = refusal === null ? 'bg-primary' : 'bg-danger';
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -top-[1.5px] right-4 z-[2] h-0 border-t-[3px] ${tone}`}
      style={{ left: `${String(16 + (depth - 1) * 28)}px` }}
    >
      <span className={`absolute -top-[7.5px] -left-1.5 size-3 rounded-full ${fill}`} />
      <span
        className={`absolute -top-3.5 right-0 rounded-full px-2 py-0.5 text-[12px] font-semibold text-white ${fill}`}
      >
        {refusal ?? t('p88cat.here')}
      </span>
    </span>
  );
}

/** Under a row's name while one is held over it: Put inside, or why not (Part 39's `.p88tag`). */
function DropTag({ ok, children }: { ok: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <span
      className={`mt-1.5 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[13px] font-semibold whitespace-normal text-white ${ok ? 'bg-primary' : 'bg-danger'}`}
    >
      <Icon name={ok ? 'layers' : 'x'} size={14} />
      {children}
    </span>
  );
}
