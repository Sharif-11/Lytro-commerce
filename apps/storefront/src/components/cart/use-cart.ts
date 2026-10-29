'use client';

import { useEffect, useState } from 'react';
import {
  browserCart,
  CART_CHANGED,
  type CartLine,
  isCartStorageEvent,
} from '@/lib/cart/cart-store';

/** SFT-05: the cart's lines in this browser, following every change, this tab's or another's. Null until the page
    runs, so the server's render and the first paint agree. */
export function useCart(): CartLine[] | null {
  const [lines, setLines] = useState<CartLine[] | null>(null);
  useEffect(() => {
    const read = () => {
      setLines(browserCart().lines());
    };
    const onStorage = (event: StorageEvent) => {
      if (isCartStorageEvent(event)) read();
    };
    read();
    window.addEventListener(CART_CHANGED, read);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CART_CHANGED, read);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return lines;
}
