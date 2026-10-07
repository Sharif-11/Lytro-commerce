/** A staff account as the owner sees it. The password is never part of this shape. */
export interface StaffRecord {
  id: string;
  phone: string | null;
  name: string | null;
  isOwner: boolean;
  active: boolean;
  createdAt: Date;
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

/** Seats in use (active users, the owner included) against the plan's seats (STF-02). */
export interface SeatUsage {
  used: number;
  total: number;
}

export interface StaffList {
  seats: SeatUsage;
  staff: StaffMember[];
}
