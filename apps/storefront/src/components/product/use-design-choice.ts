'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicProduct } from '@/lib/api/storefront-api';
import { designOptionOf, type PhotoCard, photoCardsOf } from '@/lib/product/designs';
import type { Selection } from '@/lib/product/variant-choice';

// The prototype's `pshake`: .45 s, twice.
const SHAKE_MS = 900;
// What a page's pinned header covers above the cards when it scrolls to them, as the landing page's "Order now" leaves.
const HEADER_ROOM = 72;

/**
 * ATR-19, ATR-20 (PD-4, PD-5, PD-24): choosing a design by its photo, on the product page and the landing page alike. The
 * page opens with none chosen, unless its link names a variant (`?v=`), whose design's cover the gallery then opens on.
 * A tapped card chooses its design and moves the gallery to that photo; swiping the gallery chooses nothing. Buying
 * before choosing scrolls to the cards and shakes them once (`nudge`).
 */
/** Where a design's cover is among the product's photos; the first photo before a design is chosen. */
function coverAt(
  product: PublicProduct,
  cards: readonly PhotoCard[],
  designId: string | undefined,
): number {
  if (designId === undefined || cards.length === 0) return 0;
  return Math.max(
    0,
    product.images.findIndex((image) => image.designId === designId),
  );
}

export function useDesignChoice(product: PublicProduct, selection: Selection) {
  const option = useMemo(() => designOptionOf(product), [product]);
  const cards = useMemo(() => photoCardsOf(product), [product]);
  const designId = option ? selection[option.attributeId] : undefined;
  const [photoAt, setPhotoAt] = useState(() => coverAt(product, cards, designId));
  const [tapped, setTapped] = useState<number | null>(null);
  const [nudging, setNudging] = useState(false);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nudging) return;
    const timer = setTimeout(() => {
      setNudging(false);
    }, SHAKE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [nudging]);

  const nudge = useCallback(() => {
    const cardsBox = cardsRef.current;
    if (cardsBox) {
      const scroller = cardsBox.closest('.scroll');
      if (scroller) {
        const top =
          scroller.scrollTop +
          cardsBox.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          HEADER_ROOM;
        scroller.scrollTo({ top, behavior: 'smooth' });
      } else {
        cardsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    // Off, then on in the next frame, so a second try shakes them again.
    setNudging(false);
    requestAnimationFrame(() => {
      setNudging(true);
    });
  }, []);

  /** The picks with the tapped photo's design; the gallery shows that photo. */
  const tap = (card: PhotoCard, picks: Selection): Selection => {
    setTapped(card.at);
    setPhotoAt(card.at);
    return option ? { ...picks, [option.attributeId]: card.designId } : picks;
  };

  /** The gallery on the cover of the picks' design, as a page opens on a `?v=` link; on a page Cloudflare's edge keeps,
      the browser applies the link after the first paint (Slice 9.10). */
  const openOn = useCallback(
    (picks: Selection) => {
      const id = option ? picks[option.attributeId] : undefined;
      if (id !== undefined) setPhotoAt(coverAt(product, cards, id));
    },
    [option, product, cards],
  );

  return {
    openOn,
    cards,
    designId,
    /** A design is still to be chosen: there are cards and none is chosen. */
    needed: cards.length > 0 && designId === undefined,
    photoAt,
    setPhotoAt,
    tapped,
    nudging,
    nudge,
    tap,
    cardsRef,
  };
}
