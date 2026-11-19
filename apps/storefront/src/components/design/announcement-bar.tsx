'use client';

import { announcementPairs } from '@lytronix/validators';
import { useEffect, useRef, useState } from 'react';
import type { BarItem } from '@/lib/design/announcement';

// STOREFRONT-BUILDER-PLAN BL-10, BL-16, BL-17: the bar's items two at a time, the next pair every few seconds. Every pair
// sits in one grid cell, so the bar keeps the tallest's height; all are in the page for screen readers, one is seen.
// Over the header (`pinned`), it leaves once the page scrolls and comes back at the top, as Bonik AI's does. Under 360px
// (the owner, 2026-11-19) one item at a time: both sets are drawn, the bar's width picks one, one tick turns both.

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

/** One set of the bar's frames, the one `tick` names showing. */
function Frames({
  groups,
  tick,
  kind,
}: {
  groups: BarItem[][];
  tick: number;
  kind: 'two' | 'one';
}) {
  const shown = tick % groups.length;
  return (
    <div className={`sb-set sb-${kind}`}>
      {groups.map((group, at) => (
        <div key={at} className={at === shown ? 'sb-fr sb-on' : 'sb-fr'}>
          {group.map((item, place) => (
            <span key={place}>
              {place > 0 ? <Separator /> : null}
              <Item item={item} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AnnouncementBar({ items, pinned }: { items: BarItem[]; pinned: boolean }) {
  const [tick, setTick] = useState(0);
  const [held, setHeld] = useState(false);
  const [gone, setGone] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length < 2 || held) return;
    const timer = window.setInterval(() => {
      setTick((at) => at + 1);
    }, NEXT_AFTER_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [items.length, held]);

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

  return (
    <div className={gone ? 'sb-ann-wrap sb-gone' : 'sb-ann-wrap'} ref={bar}>
      <div className="sb-ann-in">
        <div
          className="sb-ann sb-rot"
          // BL-16: held while a mouse rests on it; a finger's tap, which also says "mouse", never holds it.
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setHeld(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setHeld(false);
          }}
          onFocus={() => {
            setHeld(true);
          }}
          onBlur={() => {
            setHeld(false);
          }}
        >
          <Frames groups={announcementPairs(items)} tick={tick} kind="two" />
          <Frames groups={items.map((item) => [item])} tick={tick} kind="one" />
        </div>
      </div>
    </div>
  );
}
