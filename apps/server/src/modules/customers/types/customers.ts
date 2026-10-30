import type { SelectCustomer } from '@lytronix/db';

// The stored row, as an alias of the shared type (ENGINEERING-STANDARDS §4), never a copy.
export type CustomerRecord = SelectCustomer;

/** CUS-02: one customer as the list shows it. */
export interface CustomerListItem {
  id: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: string;
  lastOrderAt: Date | null;
  /** When the customer first ordered: the customer is made by its first order. */
  firstOrderAt: Date;
}

/** CUS-01, CUS-02: one customer, with where its latest delivery went (the known-phone fill on New order). */
export interface CustomerView extends CustomerListItem {
  lastAddress: { locationId: number; deliveryAddress: string } | null;
  /** CUS-14 (Slice 4.4b): their shopper account with the shop, so staff can set a forgotten password; null with none. */
  account: { createdAt: Date } | null;
}

/** CUS-02: one page of customers, with how many match in all. */
export interface CustomerPage {
  customers: CustomerListItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
