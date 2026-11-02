import type {
  ListenerIgnoredReason,
  ListenerMessageStatus,
  PaymentMethod,
  PaymentReviewReason,
} from '@lytronix/validators';

/** LSN-13: how one message of a batch was taken; a null status means it could not be, so the app sends it again. */
export interface ListenerUploadResult {
  status: ListenerMessageStatus | null;
  transactionId: string | null;
  reviewReason: PaymentReviewReason | null;
  ignoredReason: ListenerIgnoredReason | null;
}

/** LSN-13: a batch answered, in the order it was sent, and whether test mode is still on (LSN-04). */
export interface ListenerUploaded {
  results: ListenerUploadResult[];
  testModeUntil: Date | null;
}

/** One receipt on the app's home screen. */
export interface ListenerRecentItem {
  id: string;
  method: PaymentMethod | null;
  amount: string | null;
  transactionId: string | null;
  status: ListenerMessageStatus;
  reviewReason: PaymentReviewReason | null;
  ignoredReason: ListenerIgnoredReason | null;
  orderNumber: string | null;
  receivedAt: Date;
}

/** The app's home screen: this phone's newest receipts, and how today's stand. */
export interface ListenerRecent {
  receipts: ListenerRecentItem[];
  today: { verified: number; waiting: number; toCheck: number };
}

/** Agreed 2026-11-02 (Slice 5.4b read): a receipt as staff see it, its text until it is redacted (LSN-17). */
export type ReceiptItem = ListenerRecentItem & {
  senderNumber: string | null;
  deviceId: string;
  text: string | null;
};

export interface ReceiptPage {
  receipts: ReceiptItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** VER-06 (amended 2026-11-02): the wording of messages that could not be read, with how many arrived that day. */
export interface ListenerUnreadItem {
  day: string;
  shape: string;
  count: number;
}
