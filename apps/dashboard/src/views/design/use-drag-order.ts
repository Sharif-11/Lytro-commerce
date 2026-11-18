import { useEffect, useRef, useState } from 'react';

// STOREFRONT-BUILDER-PLAN DC-8 and BL-1: a list reordered by its rows' handles -- held and dragged with a mouse or a
// finger, the page scrolling near an edge, or moved one place with the arrow keys. The Product list and the design
// page's sections share it; each says what a move does to its own list.

// The edge of the window that scrolls the page while a row is dragged near it, and how far each move scrolls.
const EDGE = 72;
const SCROLL_STEP = 14;

/** The place a row's element carries, read where the pointer is: `data-drag-at` on the row (or its card). */
export const DRAG_AT = 'data-drag-at';

/** The arrow keys' step on a focused handle: up or left one place back, down or right one on; anything else none. */
export function arrowStep(key: string): -1 | 0 | 1 {
  if (key === 'ArrowUp' || key === 'ArrowLeft') return -1;
  if (key === 'ArrowDown' || key === 'ArrowRight') return 1;
  return 0;
}

export interface DragOrder {
  /** The key of the row being dragged, if one is. */
  dragging: string | null;
  /** A handle pressed: the row follows the pointer until it is let go. */
  startDrag: (event: React.PointerEvent, key: string) => void;
  /** A key pressed on a handle: the arrows move its row one place, within the list's ends. */
  keyMove: (event: React.KeyboardEvent, at: number, count: number) => void;
}

/**
 * A list's drag and arrow-key moves. `onOver` moves the dragged row to the place under the pointer, as often as it
 * changes; `onStep` moves a row one place for the arrow keys; `onDrop` says the drag ended, for a list that saves
 * once then.
 */
export function useDragOrder({
  disabled = false,
  onOver,
  onStep,
  onDrop,
}: {
  disabled?: boolean;
  onOver: (key: string, to: number) => void;
  onStep: (at: number, to: number) => void;
  onDrop?: (key: string) => void;
}): DragOrder {
  const [dragging, setDragging] = useState<string | null>(null);
  // The latest callbacks, read by the window's listeners for as long as a drag lasts.
  const latest = useRef({ onOver, onDrop });
  useEffect(() => {
    latest.current = { onOver, onDrop };
  });

  function startDrag(event: React.PointerEvent, key: string): void {
    if (disabled) return;
    event.preventDefault();
    setDragging(key);
    const move = (pointer: PointerEvent) => {
      if (pointer.clientY < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (pointer.clientY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
      const over = document
        .elementFromPoint(pointer.clientX, pointer.clientY)
        ?.closest<HTMLElement>(`[${DRAG_AT}]`);
      if (!over) return;
      latest.current.onOver(key, Number(over.getAttribute(DRAG_AT)));
    };
    const end = () => {
      setDragging(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      latest.current.onDrop?.(key);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function keyMove(event: React.KeyboardEvent, at: number, count: number): void {
    if (disabled) return;
    const by = arrowStep(event.key);
    if (by === 0) return;
    event.preventDefault();
    const to = at + by;
    if (to >= 0 && to < count) onStep(at, to);
  }

  return { dragging, startDrag, keyMove };
}
