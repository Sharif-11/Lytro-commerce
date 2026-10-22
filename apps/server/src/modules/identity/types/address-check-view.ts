/**
 * AUTH-11, TEN-26: an address's verdict for the create-shop screen. `unavailable` is taken or reserved alike; a
 * suggestion is the next free address from the same base, when there is one.
 */
export interface AddressCheckView {
  available: boolean;
  address: string | null;
  reason: 'format' | 'unavailable' | null;
  suggestion: string | null;
}
