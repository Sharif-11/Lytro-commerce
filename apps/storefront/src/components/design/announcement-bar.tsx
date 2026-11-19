'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { BarItem } from '@/lib/design/announcement';

// STOREFRONT-BUILDER-PLAN BL-10, BL-16, BL-17: the bar's items two at a time, the next pair every few seconds. Every pair
// sits in one grid cell, so the bar keeps the tallest's height; all are in the page for screen readers, one is seen.
// The owner, 2026-11-19: on a phone a pair wrapped to two lines and the bar stood too tall, so a narrow screen turns the
// items one at a time instead, each on one centered line (storefront-design.css shows one way or the other).
// Over the header (`pinned`), it leaves once the page scrolls and comes back at the top, as Bonik AI's does.

const NEXT_AFTER_MS = 4_000;
// The page has scrolled past the bar's height; back within a few pixels of the top, it returns (no flicker between).
const LEAVE_PAST_PX = 40;
const RETURN_WITHIN_PX = 4;

/** A dot between two parts, after which a long pair may wrap: the parts themselves never break (BL-17). */
function Separator() {
  return (
    <>
      <span className="sb-sep">·</span>
      <wbr />
    </>
  );
}

function Item({ item }: { item: BarItem }) {
  return (
    <>
      {item.pill !== null ? <span className="sb-pill">{item.pill}</span> : null}
      {item.parts.map((part, at) => (
        <span key={at}>
          {at > 0 ? <Separator /> : null}
          <span className="sb-nw">{part}</span>
        </span>
      ))}
    </>
  );
}

export function AnnouncementBar({ pairs, pinned }: { pairs: BarItem[][]; pinned: boolean }) {
  const singles = pairs.flat();
  // One count for both ways: the pair shown and the single shown each follow it.
  const [turn, setTurn] = useState(0);
  const [held, setHeld] = useState(false);
  const [gone, setGone] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (singles.length < 2 || held) return;
    const timer = window.setInterval(() => {
      setTurn((at) => at + 1);
    }, NEXT_AFTER_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [singles.length, held]);

  useEffect(() => {
    if (!pinned) return;
    // The page scrolls inside the shell's `.scroll`, under the header the bar sits in (shell.tsx).
    const page = bar.current?.closest('.shell')?.querySelector<HTMLElement>(':scope > .scroll');
    if (!page) return;
    const follow = () => {
      setGone((was) => (was ? page.scrollTop > RETURN_WITHIN_PX : page.scrollTop > LEAVE_PAST_PX));
    };
    page.addEventListener('scroll', follow, { passive: true });
    return () => {
      page.removeEventListener('scroll', follow);
    };
  }, [pinned]);

  // BL-16: held while a mouse rests on it or it has the keyboard's focus; a finger's tap, which also says "mouse", never
  // holds it.
  const holding = {
    onPointerEnter: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse') setHeld(true);
    },
    onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse') setHeld(false);
    },
    onFocus: () => {
      setHeld(true);
    },
    onBlur: () => {
      setHeld(false);
    },
  };
  const pairAt = pairs.length === 0 ? 0 : turn % pairs.length;
  const singleAt = singles.length === 0 ? 0 : turn % singles.length;

  return (
    <div className={gone ? 'sb-ann-wrap sb-gone' : 'sb-ann-wrap'} ref={bar}>
      <div className="sb-ann-in">
        <div className="sb-ann sb-rot sb-two" {...holding}>
          {pairs.map((pair, at) => (
            <div key={at} className={at === pairAt ? 'sb-fr sb-on' : 'sb-fr'}>
              {pair.map((item, place) => (
                <span key={place}>
                  {place > 0 ? <Separator /> : null}
                  <Item item={item} />
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="sb-ann sb-rot sb-one" {...holding}>
          {singles.map((item, at) => (
            <div key={at} className={at === singleAt ? 'sb-fr sb-on' : 'sb-fr'}>
              <Item item={item} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
