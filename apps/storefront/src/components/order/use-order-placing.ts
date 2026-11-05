'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderInput, OrderItemInput, PlacedOrder } from '@/lib/api/storefront-api';
import {
  NO_FIELDS,
  ORDERED_KEY,
  orderBody,
  orderFieldProblems,
  type OrderAnswer,
  type OrderFieldName,
  type OrderFields,
  type OrderOutcome,
  placedPhoneKey,
  readOrderAnswer,
} from '@/lib/order/order-form';

/** What the shopper is told after trying: nothing yet, or what became of it. */
export type OrderNotice = Exclude<OrderOutcome, { kind: 'placed' } | { kind: 'fields' }> | null;

async function send(body: unknown, key: string): Promise<OrderOutcome> {
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
    const answer = (await response.json().catch(() => null)) as OrderAnswer | null;
    return readOrderAnswer(response.status, answer);
  } catch {
    return { kind: 'failed' };
  }
}

function remember(order: PlacedOrder, phone: string): void {
  try {
    window.sessionStorage.setItem(placedPhoneKey(order.trackingId), phone);
    window.localStorage.setItem(ORDERED_KEY, '1');
  } catch {
    // Blocked storage only costs the phone number on the confirmation and the install card later.
  }
}

/** SFT-06, LND-07, LND-09: the order form's fields and the sending of it. One key from when the form first renders, kept
    through every retry, so tapping twice or trying again after a timeout makes one order; a reload starts a new one.
    Only one try runs at a time. */
export function useOrderPlacing(options: {
  initialThana: number | null;
  source: 'storefront' | 'landing_page';
  /** What a signed-in shopper's account fills in at the start. */
  initial?: Partial<OrderFields>;
}) {
  const [fields, setFields] = useState<OrderFields>({
    ...NO_FIELDS,
    thanaId: options.initialThana,
    ...options.initial,
  });
  const [problems, setProblems] = useState<OrderFieldName[]>([]);
  const [notice, setNotice] = useState<OrderNotice>(null);
  const [placing, setPlacing] = useState(false);
  // What a refusal says is at the top of the page, and on a phone the shopper is down by the button.
  useEffect(() => {
    if (notice)
      document.querySelector('.banner[role="alert"]')?.scrollIntoView({ block: 'center' });
  }, [notice]);
  const key = useRef('');
  if (key.current === '' && typeof window !== 'undefined') key.current = crypto.randomUUID();
  const running = useRef(false);

  const setField = useCallback(
    <Name extends keyof OrderFields>(name: Name, value: OrderFields[Name]) => {
      setFields((held) => ({ ...held, [name]: value }));
      setProblems((held) => held.filter((field) => field !== name));
    },
    [],
  );
  const setThana = useCallback((thanaId: number | null) => {
    setFields((held) => ({ ...held, thanaId }));
    setProblems((held) => held.filter((field) => field !== 'locationId'));
  }, []);

  /** Sends the order when its fields are right; the placed order, or null with the problem shown. */
  const place = useCallback(
    async (
      items: OrderItemInput[],
      payment?: OrderInput['payment'],
    ): Promise<PlacedOrder | null> => {
      if (running.current) return null;
      const wrong = orderFieldProblems(fields);
      setProblems(wrong);
      if (wrong.length > 0) {
        setNotice(null);
        return null;
      }
      running.current = true;
      setPlacing(true);
      setNotice(null);
      const outcome = await send(orderBody(fields, items, options.source, payment), key.current);
      running.current = false;
      setPlacing(false);
      if (outcome.kind === 'placed') {
        remember(outcome.order, fields.phone.trim());
        return outcome.order;
      }
      if (outcome.kind === 'fields') {
        setProblems(outcome.fields);
        return null;
      }
      if (outcome.kind === 'key_spent') {
        // The key already made an order from a different form, so this one needs its own; a further tap sends it.
        key.current = crypto.randomUUID();
        setNotice({ kind: 'failed' });
        return null;
      }
      setNotice(outcome);
      return null;
    },
    [fields, options.source],
  );

  return { fields, setField, setThana, problems, notice, setNotice, placing, place };
}
