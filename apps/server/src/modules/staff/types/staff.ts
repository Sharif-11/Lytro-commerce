/** A staff account as the owner sees it. The password is never part of this shape. */
export interface StaffRecord {
  id: string;
  phone: string | null;
  name: string | null;
  isOwner: boolean;
  active: boolean;
  createdAt: Date;
  /** STF-13, AUTH-31: the owner set the password and the member has not yet chosen their own. */
  mustSetPassword: boolean;
}

/** ADM-03, D8-27: a member of the shop's team with the account they sign in with; the owner's is the shop's own. */
export interface TeamAccount {
  userId: string;
  name: string | null;
  phone: string | null;
  isOwner: boolean;
  active: boolean;
  /** Null for the owner's row, whose account is the shop's owner (tenants.subscriber_id). */
  subscriberId: string | null;
}

/** A staff account with the roles it holds. */
export interface StaffMember extends StaffRecord {
  roleIds: string[];
}

/** What a sign-in needs about a staff member. The password hash never leaves the server. */
export interface StaffCredentials {
  userId: string;
  isOwner: boolean;
  active: boolean;
  subscriberId: string | null;
  passwordHash: string | null;
  mustSetPassword: boolean;
}

/** Seats in use (active users, the owner included) against the plan's seats (STF-02). `null` total is unlimited (PLN-19). */
export interface SeatUsage {
  used: number;
  total: number | null;
}

export interface StaffList {
  seats: SeatUsage;
  staff: StaffMember[];
}
