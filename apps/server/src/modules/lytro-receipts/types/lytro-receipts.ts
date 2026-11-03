import type {
  ListenerRecent,
  ListenerRecentItem,
} from '../../listener-receipts/types/listener-receipts';

/** The app's home screen for Lytro's own phone: the same shape a shop's phone reads. */
export type LytroRecentItem = ListenerRecentItem;
export type LytroRecent = ListenerRecent;

/** PAY-21: a receipt as the operator sees it, its text until it is redacted (LSN-17). */
export type LytroReceiptItem = LytroRecentItem & {
  senderNumber: string | null;
  deviceId: string;
  planPaymentId: string | null;
  text: string | null;
};

export interface LytroReceiptPage {
  receipts: LytroReceiptItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
