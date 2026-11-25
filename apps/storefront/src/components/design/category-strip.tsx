'use client';

import { useEffect, useRef, useState } from 'react';
import {
  nextStop,
  overflows,
  ROTATE_EVERY_MS,
  ROTATE_IDLE_MS,
  type TileBox,
} from '@/lib/design/rotation';

/** One tile of the home's categories, as the section drew it before (sections.tsx). */
export interface CategoryTile {
  id: string;
  href: string;
  name: string;
  picture: string;
  /** The circle style's "Nটি পণ্য"; null in the other styles. */
  count: string | null;
}

function Tile({ tile, tall, copy }: { tile: CategoryTile; tall: boolean; copy: boolean }) {
  return (
    <a
      className={copy ? 'sb-cat sb-copy' : 'sb-cat'}
      href={tile.href}
      aria-hidden={copy ? true : undefined}
      tabIndex={copy ? -1 : undefined}
    >
      <div className="sb-im">
        <img src={tile.picture} alt="" loading="lazy" />
      </div>
      {tall ? <span>{tile.name} →</span> : tile.name}
      {tile.count !== null ? <em>{tile.count}</em> : null}
    </a>
  );
}

/** The tiles' boxes, the copies left out, from the strip's left edge (the strip is their offset parent). */
function boxesOf(strip: HTMLElement, copies: boolean): TileBox[] {
  return [...strip.querySelectorAll<HTMLElement>(copies ? '.sb-cat' : '.sb-cat:not(.sb-copy)')].map(
    (tile) => ({ left: tile.offsetLeft, width: tile.offsetWidth }),
  );
}

/**
 * STOREFRONT-BUILDER-PLAN SB-32: the home's category tiles; when they overflow the strip (measured live, again on a
 * resize or a turn of the phone), it moves on a tile every 3 seconds, and after the last the first ones follow --
 * copies of the tiles, hidden from screen readers and out of the tab order, the strip stepping back by one round where
 * the two look the same. It holds while the shopper touches, drags, hovers over or focuses it, and for 4 idle seconds
 * after; it never moves off-screen, in a hidden tab or with reduced motion. Swiping by hand works as before.
 */
export function CategoryStrip({
  className,
  tiles,
  tall,
}: {
  className: string;
  tiles: readonly CategoryTile[];
  tall: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const measure = () => {
      setRotating(!reduced.matches && overflows(boxesOf(element, false), element.clientWidth));
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    reduced.addEventListener('change', measure);
    return () => {
      resized.disconnect();
      reduced.removeEventListener('change', measure);
    };
  }, []);

  useEffect(() => {
    const element = strip.current;
    if (!element || !rotating) return;
    let holdUntil = 0;
    let touching = false;
    let hovering = false;
    let focused = false;
    let onScreen = true;
    // Until when a scroll is the strip's own, not the shopper's.
    let ownUntil = 0;
    const hold = () => {
      holdUntil = Date.now() + ROTATE_IDLE_MS;
    };
    // Past the last tile the copies show the first ones: step back a round, where the two look the same.
    const wrap = () => {
      const boxes = boxesOf(element, true);
      const round = boxes[tiles.length];
      const first = boxes[0];
      if (!round || !first) return;
      const period = round.left - first.left;
      if (element.scrollLeft >= period - 1) {
        ownUntil = Date.now() + 150;
        element.scrollLeft -= period;
      }
    };
    const step = () => {
      if (document.hidden || !onScreen || touching || hovering || focused) return;
      if (Date.now() < holdUntil) return;
      wrap();
      const stop = nextStop(boxesOf(element, true), element.scrollLeft);
      if (stop === null) return;
      ownUntil = Date.now() + 1_200;
      element.scrollTo({ left: stop, behavior: 'smooth' });
    };
    const timer = window.setInterval(step, ROTATE_EVERY_MS);
    const seen = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
    });
    seen.observe(element);
    const down = () => {
      touching = true;
    };
    const up = () => {
      touching = false;
      hold();
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') hovering = true;
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      hovering = false;
      hold();
    };
    const focusIn = () => {
      focused = true;
    };
    const focusOut = () => {
      focused = false;
      hold();
    };
    const scrolled = () => {
      if (Date.now() > ownUntil) hold();
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focusIn);
    element.addEventListener('focusout', focusOut);
    element.addEventListener('scroll', scrolled, { passive: true });
    element.addEventListener('wheel', hold, { passive: true });
    element.addEventListener('touchstart', down, { passive: true });
    element.addEventListener('touchend', up, { passive: true });
    return () => {
      window.clearInterval(timer);
      seen.disconnect();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focusIn);
      element.removeEventListener('focusout', focusOut);
      element.removeEventListener('scroll', scrolled);
      element.removeEventListener('wheel', hold);
      element.removeEventListener('touchstart', down);
      element.removeEventListener('touchend', up);
    };
  }, [rotating, tiles.length]);

  return (
    <div ref={strip} className={className} data-rotating={rotating ? 'true' : undefined}>
      {tiles.map((tile) => (
        <Tile key={tile.id} tile={tile} tall={tall} copy={false} />
      ))}
      {rotating
        ? tiles.map((tile) => <Tile key={`copy-${tile.id}`} tile={tile} tall={tall} copy />)
        : null}
    </div>
  );
}
