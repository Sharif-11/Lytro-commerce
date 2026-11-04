/** One line of Today's "Recent changes" (OPERATOR-CONSOLE-DESIGN §3). */
export interface RecentChange {
  id: number;
  action: string;
  at: Date;
  /** The operator's email; null for a change no operator made. */
  by: string | null;
  /** A rate's or a setting's key, with its old and new value. */
  key: string | null;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  /** The shop a suspension was of. */
  shop: { id: string; name: string; slug: string } | null;
}
