import { ORDER_LINES_MAX } from '@lytronix/validators/common';

// SFT-05: the cart lives in the shopper's browser and reserves nothing; stock is held only when an order is placed
// (Phase 4). One line per variant; adding the same variant again adds to its quantity.
export interface CartLine {
  variantId: string;
  productSlug: string;
  name: string;
  /** The picked options, as the shopper saw them (`M · Navy`). */
  choice: string;
  /** The price when it was added, so the cart can say when the shop's price has changed since (Slice 12b). */
  price: string;
  image: string | null;
  quantity: number;
}

export type CartStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The window event a change to the cart raises, so the header's count and an open drawer follow it. */
export const CART_CHANGED = 'lytro-cart-changed';
/** The window event that opens the cart drawer, as "View cart" on the added-to-cart toast does. */
export const CART_OPEN = 'lytro-cart-open';
const CART_KEY = 'lytro-cart';

export class CartStore {
  constructor(
    private readonly storage: CartStorage | null,
    private readonly changed: () => void = () => undefined,
    private readonly key = CART_KEY,
  ) {}

  lines(): CartLine[] {
    try {
      const stored: unknown = JSON.parse(this.storage?.getItem(this.key) ?? '[]');
      return Array.isArray(stored) ? stored.filter((held) => CartStore.isLine(held)) : [];
    } catch {
      return [];
    }
  }

  /** Adds a line, or its quantity to the same variant's line. False when the cart already holds as many lines as an
      order may (ORDER_LINES_MAX), so the page can say so instead of losing one. */
  add(line: CartLine): boolean {
    const lines = this.lines();
    const same = lines.find((held) => held.variantId === line.variantId);
    if (same) same.quantity += line.quantity;
    else if (lines.length >= ORDER_LINES_MAX) return false;
    else lines.push(line);
    this.save(lines);
    return true;
  }

  /** A line's new quantity; none or fewer removes it. */
  setQuantity(variantId: string, quantity: number): void {
    const lines = this.lines();
    const line = lines.find((held) => held.variantId === variantId);
    if (!line) return;
    if (quantity <= 0) {
      this.remove(variantId);
      return;
    }
    line.quantity = quantity;
    this.save(lines);
  }

  remove(variantId: string): void {
    this.save(this.lines().filter((held) => held.variantId !== variantId));
  }

  count(): number {
    return this.lines().reduce((sum, line) => sum + line.quantity, 0);
  }

  private save(lines: CartLine[]): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(lines));
    } catch {
      // A full or blocked store keeps the page working; the cart is simply not remembered.
    }
    this.changed();
  }

  private static isLine(value: unknown): value is CartLine {
    if (typeof value !== 'object' || value === null) return false;
    const line = value as Partial<CartLine>;
    return (
      typeof line.variantId === 'string' &&
      typeof line.productSlug === 'string' &&
      typeof line.name === 'string' &&
      typeof line.price === 'string' &&
      typeof line.quantity === 'number' &&
      line.quantity > 0
    );
  }
}

/** The shopper's cart in this browser, or one that remembers nothing where storage is blocked. A change tells the
    page (CART_CHANGED); another tab's change arrives as the browser's own `storage` event. */
export function browserCart(): CartStore {
  const changed = () => {
    window.dispatchEvent(new Event(CART_CHANGED));
  };
  try {
    return new CartStore(window.localStorage, changed);
  } catch {
    return new CartStore(null, changed);
  }
}

/** Whether a `storage` event is the cart's, changed in another tab. */
export function isCartStorageEvent(event: StorageEvent): boolean {
  return event.key === CART_KEY || event.key === null;
}
