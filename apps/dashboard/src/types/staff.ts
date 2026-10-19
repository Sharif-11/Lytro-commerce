/** Mirrors `StaffMember`/`StaffList` in apps/server/src/modules/staff/types/staff.ts (structural duplicate,
    see types/me.ts). */
export interface StaffMember {
  id: string;
  phone: string | null;
  name: string | null;
  isOwner: boolean;
  active: boolean;
  createdAt: string;
  roleIds: string[];
}

export interface SeatUsage {
  used: number;
  /** PLN-19: null is unlimited. Seats count the owner (STF-02). */
  total: number | null;
}

export interface StaffList {
  seats: SeatUsage;
  staff: StaffMember[];
}

/** Mirrors `RoleSummary` in apps/server/src/modules/staff/types/role.ts. */
export interface RoleSummary {
  id: string;
  name: string;
  permissions: string[];
  holders: number;
}
