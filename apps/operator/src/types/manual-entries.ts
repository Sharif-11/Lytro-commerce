import type {
  PaymentMethod,
  PaymentMethodKind,
  PlanPaymentKind,
  RetireState,
} from '@lytronix/validators';

// Mirrors the operator's manual entries, payment screenshots and payment method types (OPERATOR-CONSOLE-DESIGN v7 §4b and
// §10d; Phase 8 Slices 8.5, 8.7 and 8.8). Times are ISO strings.

/** `manualEntryViewSchema` in apps/server/src/modules/team/dto/operator-manual-entries.dto.ts: an entry or a reversal. */
export interface ManualEntry {
  id: string;
  tenantId: string;
  shopName: string;
  shopSlug: string;
  planPaymentId: string;
  kind: PlanPaymentKind;
  planName: string | null;
  amount: string;
  /** One of Lytro's numbers, or (D8-75) one of its bank accounts; neither on a reversal. */
  walletId: string | null;
  bankAccountId: string | null;
  /** The TrxID, or a bank transfer's reference. */
  transactionId: string | null;
  senderNumber: string | null;
  paidAt: string | null;
  evidenceId: string | null;
  evidenceLine: string | null;
  reason: string;
  enteredBy: string;
  enteredByEmail: string | null;
  reversesEntryId: string | null;
  reversedBy: { id: string; reason: string; at: string } | null;
  createdAt: string;
}

export interface ManualEntryPage {
  entries: ManualEntry[];
  total: number;
  page: number;
  limit: number;
}

/** POST /operator/manual-entries/preview: what an entry would be for the shop now (D8-51). */
export interface ManualEntryPreview {
  kind: PlanPaymentKind;
  amount: string;
  creditAmount: string;
  addons: { key: string; labelEn: string; labelBn: string; quantity: number; price: string }[];
  periodEnd: string | null;
  /** ADM-15: over ৳10,000, or past 10 entries today. */
  needsConfirmation: boolean;
}

/** A five-minute link to a screenshot (ADM-17, D8-47). */
export interface EvidenceLink {
  url: string;
  expiresAt: string;
}

/** POST /operator/manual-entries/evidence: where to send the screenshot, and the key the entry names. */
export interface EvidenceUpload {
  key: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
}

/** GET /operator/payment-method-types (WAL-18, D8-65 to D8-67): a type, its state and what leans on it. */
export interface WalletType {
  method: PaymentMethod;
  kind: PaymentMethodKind;
  state: RetireState;
  retiringSince: string | null;
  removedAt: string | null;
  shopsOn: number;
  shopsWithAccounts: number;
  openPayments: number;
  /** D8-65, D8-66: the shops that set it up, switched on or with an account, each once: the shops told. */
  shopsSetUp: number;
  lytroTakes: boolean;
}
