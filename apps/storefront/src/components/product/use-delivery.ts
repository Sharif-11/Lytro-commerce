'use client';

import { useEffect, useState } from 'react';
import type { DeliveryEstimate, EstimateItem, Locations } from '@/lib/api/storefront-api';

// SFT-20, LND-08: the delivery charge for what the shopper has picked, worked out by the server's one pricing function
// (never here). The page's first render brings the first answer; a change of item, quantity or area asks again. With
// no first answer (the cart, Slice 12b), it asks at once. `settled` says the answer is for what is on the page now, so a
// checkout never places an order on the charge of the thana before.
export function useSettledEstimate(
  initial: DeliveryEstimate | null,
  items: EstimateItem[] | null,
  areaId: number | null,
): { estimate: DeliveryEstimate | null; settled: boolean } {
  const key = items === null ? null : JSON.stringify({ items, areaId });
  const [answer, setAnswer] = useState({ key: initial === null ? null : key, estimate: initial });
  useEffect(() => {
    if (key === null || key === answer.key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchEstimate(key, controller.signal).then((next) => {
        if (!controller.signal.aborted) setAnswer({ key, estimate: next });
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, answer.key]);
  return { estimate: answer.estimate, settled: key === answer.key };
}

export function useDeliveryEstimate(
  initial: DeliveryEstimate | null,
  items: EstimateItem[] | null,
  areaId: number | null,
): DeliveryEstimate | null {
  return useSettledEstimate(initial, items, areaId).estimate;
}

async function fetchEstimate(key: string, signal: AbortSignal): Promise<DeliveryEstimate | null> {
  const { items, areaId } = JSON.parse(key) as { items: EstimateItem[]; areaId: number | null };
  try {
    const response = await fetch('/api/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(areaId === null ? { items } : { items, locationId: areaId }),
      signal,
    });
    return response.ok ? ((await response.json()) as DeliveryEstimate | null) : null;
  } catch {
    return null;
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
