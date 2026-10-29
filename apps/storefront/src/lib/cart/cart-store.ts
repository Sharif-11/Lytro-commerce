import { ORDER_LINES_MAX } from '@lytronix/validators/common';

// SFT-05: the cart lives in the shopper's browser and reserves nothing; stock is held only when an order is placed
// (Phase 4). One line per variant; adding the same variant again adds to its quantity.
export interface CartLine {
  variantId: string;
  productSlug: string;
  name: string;
  /** The picked options, as the shopper saw them (`M · Navy`). */
  choice: string;
  price: string;
  image: string | null;
  quantity: number;
}

export type CartStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class CartStore {
  constructor(
    private readonly storage: CartStorage | null,
    private readonly key = 'lytro-cart',
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

  count(): number {
    return this.lines().reduce((sum, line) => sum + line.quantity, 0);
  }

  private save(lines: CartLine[]): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(lines));
    } catch {
      // A full or blocked store keeps the page working; the cart is simply not remembered.
    }
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

/** The shopper's cart in this browser, or one that remembers nothing where storage is blocked. */
export function browserCart(): CartStore {
  try {
    return new CartStore(window.localStorage);
  } catch {
    return new CartStore(null);
  }
}
