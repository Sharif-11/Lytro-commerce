import type {
  StorefrontCardKey,
  StorefrontCardRow,
  StorefrontDesignValues,
  Transaction,
} from '@lytronix/db';
import type {
  StorefrontDesignRecord,
  StorefrontSale,
  StorefrontTarget,
} from '../types/storefront-design';

/** SB-12, SB-14: tenant.storefront_designs, and what a design names and starts from. */
export interface StorefrontDesignStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  find(tx: Transaction, tenantId: string): Promise<StorefrontDesignRecord | null>;
  /** The shop's row, held to the end of the transaction (made empty first when it has none). */
  lock(tx: Transaction, tenantId: string): Promise<StorefrontDesignRecord>;
  write(
    tx: Transaction,
    tenantId: string,
    values: StorefrontDesignValues,
  ): Promise<StorefrontDesignRecord>;
  deleteForTenant(tx: Transaction, tenantId: string): Promise<void>;
  /** SB-11: the shop's type, a preset key; null until chosen. */
  businessType(tx: Transaction, tenantId: string): Promise<string | null>;
  /** SB-16: those of these categories and products the shop still has. */
  targets(
    tx: Transaction,
    tenantId: string,
    categoryIds: readonly string[],
    productIds: readonly string[],
  ): Promise<{ categories: StorefrontTarget[]; products: StorefrontTarget[] }>;
  /** SB-30: the shop's first categories, in its own order, that shoppers see and that hold an active product (any stock). */
  firstFilledCategories(tx: Transaction, tenantId: string, limit: number): Promise<string[]>;
  /** SB-9: what is on sale now. */
  sale(tx: Transaction, tenantId: string): Promise<StorefrontSale>;
  /** SB-15: the width of each of these that is a ready image of the shop's (null when not recorded); others left out. */
  photoWidths(
    tx: Transaction,
    tenantId: string,
    ids: readonly string[],
  ): Promise<Map<string, number | null>>;
  /** DC-2: whether each design of a product is its own card (on unless the shop turned it off). */
  designCards(tx: Transaction, tenantId: string): Promise<boolean>;
  setDesignCards(tx: Transaction, tenantId: string, on: boolean): Promise<void>;
  /** DC-6: every card of the shop's products not archived, in its default lists' order. */
  cards(tx: Transaction, tenantId: string, designs: boolean): Promise<StorefrontCardRow[]>;
  /** DC-8: each named product's way (the default kept as no row). */
  replaceCardModes(
    tx: Transaction,
    tenantId: string,
    modes: readonly { productId: string; mode: string }[],
  ): Promise<void>;
  /** DC-6: the seller's order, whole. */
  replaceCardPositions(
    tx: Transaction,
    tenantId: string,
    cards: readonly StorefrontCardKey[],
  ): Promise<void>;
}
