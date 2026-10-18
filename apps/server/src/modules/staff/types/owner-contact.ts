/** The shop owner's own contact, for a platform-sent notice (never a staff member's), and the name an
 * invoice is made out to (BIL-12). */
export interface OwnerContact {
  phone: string | null;
  email: string | null;
  name: string | null;
}
