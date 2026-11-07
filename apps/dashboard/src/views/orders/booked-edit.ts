/**
 * ORD-11 (the Phase 6 close-out, Part 36's `c36-edited`): an order just saved while booked, so its page says once that the
 * courier still has the old details. Kept for the page the editor returns to, never stored.
 */
const edited = new Set<string>();

export function noteBookedEdit(orderId: string): void {
  edited.add(orderId);
}

/** True once for an order just saved while booked; the note is taken with it. */
export function takeBookedEdit(orderId: string): boolean {
  return edited.delete(orderId);
}
