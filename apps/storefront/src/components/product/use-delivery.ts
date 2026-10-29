'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeliveryEstimate, EstimateItem, Locations } from '@/lib/api/storefront-api';

// SFT-20, LND-08: the delivery charge for what the shopper has picked, worked out by the server's one pricing function
// (never here). The page's first render brings the first answer; a change of item, quantity or area asks again.
export function useDeliveryEstimate(
  initial: DeliveryEstimate | null,
  items: EstimateItem[] | null,
  areaId: number | null,
): DeliveryEstimate | null {
  const [estimate, setEstimate] = useState(initial);
  const key = items === null ? null : JSON.stringify({ items, areaId });
  const answered = useRef(key);
  useEffect(() => {
    if (key === null || key === answered.current) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchEstimate(key, controller.signal).then((next) => {
        answered.current = key;
        setEstimate(next);
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  return estimate;
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
