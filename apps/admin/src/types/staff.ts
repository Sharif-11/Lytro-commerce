/**
 * Mirrors `StaffMember`/`StaffList` in apps/server/src/modules/staff/types/staff.ts — a deliberate structural
 * duplicate (see types/me.ts's own note), not a copy of something this package could otherwise import.
 */
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
  total: number;
}

export interface StaffList {
  seats: SeatUsage;
  staff: StaffMember[];
}
