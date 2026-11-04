import { ORDER_LINES_MAX } from '@lytronix/validators/common';
import type { StockUnit } from '@lytronix/validators/enums';
import { countedUnits } from '../product/quantity';
import type { EstimateItem, ModifierChoice, OrderItemInput } from '../api/storefront-api';

// SFT-05: the cart lives in the shopper's browser and reserves nothing; stock is held only when an order is placed. One
// line per variant and what was picked with it (Slice 4.8e); adding the same again adds to its quantity.

/** MNU-02: an add-on as its line shows it. */
export interface CartAddOn {
  name: string;
  priceChange: string;
}
/** CMB-03: a choice part's picks for one combo; every combo on the line takes the same. */
export interface CartComboPick {
  part: number;
  variantIds: string[];
}
/** ATR-08: what the shopper answered. */
export interface CartAnswer {
  attributeId: string;
  name: string;
  value: string;
}

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
  /** LND-07, UOM-04: what the quantity is of; a line from before this has none, and is whole. */
  stockUnit?: StockUnit;
  sharedStock?: boolean;
  /** MNU-02: every add-on group's choice, as the order names them. */
  modifiers?: ModifierChoice[];
  addOns?: CartAddOn[];
  /** CMB-03: a combo's choices, and all its parts in words (`Panjabi L, Check lungi`). */
  comboPicks?: CartComboPick[];
  partsText?: string;
  answers?: CartAnswer[];
}

export type CartStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The window event a change to the cart raises, so the header's count and an open drawer follow it. */
export const CART_CHANGED = 'lytro-cart-changed';
/** The window event that opens the cart drawer, as "View cart" on the added-to-cart toast does. */
export const CART_OPEN = 'lytro-cart-open';
const CART_KEY = 'lytro-cart';

/** What makes a line itself: a plain variant, or the variant with what was picked. Two different picks are two lines. */
export function lineKey(line: CartLine): string {
  const picked = [
    (line.modifiers ?? []).filter((choice) => choice.optionIds.length > 0),
    line.comboPicks ?? [],
    (line.answers ?? []).map((answer) => [answer.attributeId, answer.value]),
  ];
  return picked.every((part) => part.length === 0)
    ? line.variantId
    : `${line.variantId} ${JSON.stringify(picked)}`;
}

/** What one line adds to one unit, as far as the browser knows until the shop answers. */
export function addOnsPriceOf(line: CartLine): number {
  return (line.addOns ?? []).reduce((sum, row) => sum + Number(row.priceChange), 0);
}

/** SFT-20: a line as the delivery estimate asks it. */
export function estimateItemOf(line: CartLine): EstimateItem {
  return {
    variantId: line.variantId,
    quantity: line.quantity,
    ...(line.modifiers && line.modifiers.length > 0 ? { modifiers: line.modifiers } : {}),
  };
}

/** ORD-02: a line as an order names it. */
export function orderItemOf(line: CartLine): OrderItemInput {
  const answers = line.answers ?? [];
  const picks = line.comboPicks ?? [];
  return {
    ...estimateItemOf(line),
    ...(picks.length > 0 ? { choices: picks } : {}),
    ...(answers.length > 0
      ? {
          captured: answers.map(({ attributeId, value }) => ({ attributeId, value })),
        }
      : {}),
  };
}

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

  /** Adds a line, or its quantity to the same line. False when the cart already holds as many lines as an order may
      (ORDER_LINES_MAX), so the page can say so instead of losing one. */
  add(line: CartLine): boolean {
    const lines = this.lines();
    const same = lines.find((held) => lineKey(held) === lineKey(line));
    if (same) same.quantity += line.quantity;
    else if (lines.length >= ORDER_LINES_MAX) return false;
    else lines.push(line);
    this.save(lines);
    return true;
  }

  /** A line's new quantity, by its key; none or fewer removes it. */
  setQuantity(key: string, quantity: number): void {
    const lines = this.lines();
    const line = lines.find((held) => lineKey(held) === key);
    if (!line) return;
    if (quantity <= 0) {
      this.remove(key);
      return;
    }
    line.quantity = quantity;
    this.save(lines);
  }

  remove(key: string): void {
    this.save(this.lines().filter((held) => lineKey(held) !== key));
  }

  /** An order was placed: its lines leave the cart. */
  clear(): void {
    this.save([]);
  }

  count(): number {
    return this.lines().reduce((sum, line) => sum + countedUnits(line.stockUnit, line.quantity), 0);
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
      line.quantity > 0 &&
      [line.modifiers, line.addOns, line.comboPicks, line.answers].every(
        (part) => part === undefined || Array.isArray(part),
      )
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
