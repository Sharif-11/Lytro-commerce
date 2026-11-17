'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type DeliveryEstimate,
  type EstimateItem,
  isBusyStatus,
  type Locations,
} from '@/lib/api/storefront-api';
import { estimateQueryString } from '@/lib/product/estimate-query';

/** An estimate as the browser last had it answered: for which items and area, and whether the server was too busy. */
interface EstimateAnswer {
  key: string | null;
  estimate: DeliveryEstimate | null;
  busy: boolean;
}

/** What the page shows of the charge. `busy`: the server was too busy to work it out (Slice 9.10, `p910-busy-delivery`),
    and `retry` asks again, for the charge's own Try again. */
export interface SettledEstimate {
  estimate: DeliveryEstimate | null;
  settled: boolean;
  busy: boolean;
  retry: () => void;
}

// SFT-20, LND-08: the delivery charge for what the shopper has picked, worked out by the server's one pricing function
// (never here). The page's first render brings the first answer; a change of item, quantity or area asks again. With
// no first answer (the cart, Slice 12b), it asks at once. `settled` says the answer is for what is on the page now, so a
// checkout never places an order on the charge of the thana before. A product or landing page names its product, so a
// charge for one of its variants alone is asked in the form Cloudflare's edge keeps (Slice 9.10, estimate-query.ts).
export function useSettledEstimate(
  initial: DeliveryEstimate | null,
  items: EstimateItem[] | null,
  areaId: number | null,
  productId?: string,
): SettledEstimate {
  const key = items === null ? null : JSON.stringify({ items, areaId, productId });
  const [answer, setAnswer] = useState<EstimateAnswer>({
    key: initial === null ? null : key,
    estimate: initial,
    busy: false,
  });
  useEffect(() => {
    if (key === null || key === answer.key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchEstimate(key, controller.signal).then((next) => {
        if (!controller.signal.aborted) setAnswer({ key, ...next });
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, answer.key]);
  // Forgetting which items the answer was for asks again; the busy words stay until the new answer comes.
  const retry = useCallback(() => {
    setAnswer((held) => ({ ...held, key: null }));
  }, []);
  return { estimate: answer.estimate, settled: key === answer.key, busy: answer.busy, retry };
}

export function useDeliveryEstimate(
  initial: DeliveryEstimate | null,
  items: EstimateItem[] | null,
  areaId: number | null,
): DeliveryEstimate | null {
  return useSettledEstimate(initial, items, areaId).estimate;
}

async function fetchEstimate(
  key: string,
  signal: AbortSignal,
): Promise<Omit<EstimateAnswer, 'key'>> {
  const { items, areaId, productId } = JSON.parse(key) as {
    items: EstimateItem[];
    areaId: number | null;
    productId?: string;
  };
  const [only] = items;
  const kept =
    productId !== undefined &&
    only !== undefined &&
    items.length === 1 &&
    (only.modifiers === undefined || only.modifiers.length === 0);
  try {
    const response = kept
      ? await fetch(
          `/api/estimate?${estimateQueryString({
            productId,
            variantId: only.variantId,
            quantity: only.quantity,
            areaId,
          })}`,
          { signal },
        )
      : await fetch('/api/estimate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(areaId === null ? { items } : { items, locationId: areaId }),
          signal,
        });
    if (response.ok) {
      return { estimate: (await response.json()) as DeliveryEstimate | null, busy: false };
    }
    return { estimate: null, busy: isBusyStatus(response.status) };
  } catch {
    return { estimate: null, busy: false };
  }
}

/** CUS-08: the zillas and thanas, read once when a picker first opens. */
export function useLocations(wanted: boolean): Locations | null {
  const [locations, setLocations] = useState<Locations | null>(null);
  useEffect(() => {
    if (!wanted || locations !== null) return;
    const controller = new AbortController();
    fetch('/api/locations', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Locations>) : null))
      .then((list) => {
        if (list) setLocations(list);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [wanted, locations]);
  return locations;
}
