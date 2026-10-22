/** BAL-03, BIL-04: payments the shop submitted that the operator is still checking. */
export interface BeingChecked {
  count: number;
  amount: string;
}

/**
 * SUP-01: the set-up checklist's items the server can tell. "Shop created" and the delivery charges are done from the
 * start (the home-area defaults, DLV-01), shown with their amounts; the items that wait for later phases (a wallet
 * number, a courier, SMS events, a listener phone) are the dashboard's to grey out.
 */
export interface SetupChecklist {
  deliveryCharges: { inside: string; outside: string };
  firstProduct: boolean;
  logo: boolean;
  linkShared: boolean;
  apiKey: boolean;
}

/**
 * The Home screen in one read (TENANT-DASHBOARD-DESIGN §7.1). Each part is null when the caller may not see it, so a
 * staff member's Home holds only their own jobs (STF-11); the checklist is the owner's alone.
 */
export interface HomeView {
  /** PRD-12: products not archived, and the active ones -- products:read. */
  products: { total: number; active: number } | null;
  /** INV-08, INV-13: active products low or out of stock, and batches expiring soon -- inventory:read. */
  stock: { low: number; out: number; expiringBatches: number } | null;
  /** BAL-01, BAL-13, AUTH-21: the balance, whether it is low, and this cycle's free SMS -- balance:read. */
  balance: { amount: string; low: boolean; freeSms: { used: number; limit: number | null } } | null;
  /** BAL-03: top-ups being checked -- balance:read. */
  topUpsBeingChecked: BeingChecked | null;
  /** BIL-04, PLN-14: plan and add-on payments being checked -- payments:read. */
  paymentsBeingChecked: BeingChecked | null;
  /** STF-13, AUTH-31: active staff who have not yet chosen their own password -- staff:read. */
  staffWithoutPassword: number | null;
  /** RTE-12: this cycle's last fast-spend alert -- keys:manage; null also when there was none. */
  fastSpendAlertedAt: Date | null;
  checklist: SetupChecklist | null;
}
