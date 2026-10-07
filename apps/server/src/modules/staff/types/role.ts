/** A role of the shop: a name and the permissions it grants (STF-07). */
export interface RoleRecord {
  id: string;
  name: string;
  permissions: string[];
}

/** A role with the number of users who hold it, for the roles list (STF-09). */
export interface RoleSummary extends RoleRecord {
  holders: number;
}
