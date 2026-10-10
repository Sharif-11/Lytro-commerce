/** Mirrors `RoleSummary` in apps/server/src/modules/staff/types/role.ts — see types/me.ts's own note on why
    this is a deliberate structural duplicate, not an import. */
export interface RoleSummary {
  id: string;
  name: string;
  permissions: string[];
  holders: number;
}
