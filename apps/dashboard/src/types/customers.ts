// Mirrors apps/server/src/modules/customers/types (GET /customers, GET /customers/:id; CUS-01, CUS-02, CUS-14). Times
// are ISO strings, amounts decimal strings in taka.

/** A customer as the list shows them; the customer is made by their first order. */
export interface CustomerSummary {
  id: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: string;
  lastOrderAt: string | null;
  firstOrderAt: string;
  /** CUS-02: the phone has a shopper's account on the storefront. */
  hasAccount: boolean;
}

/** One customer: where their latest delivery went, and their shopper account (CUS-14). */
export interface Customer extends CustomerSummary {
  lastAddress: { locationId: number; deliveryAddress: string } | null;
  account: { createdAt: string } | null;
}

/** GET /customers: who ordered last first, a page at a time. */
export interface CustomerPage {
  customers: CustomerSummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
