import { Permission } from '@lytronix/validators';

/**
 * Scoped to the permissions that actually gate something today — staff and activity, the only features
 * Phase 1 ships. @lytronix/validators' Permission enum has ~30 values covering the platform's eventual
 * scope (orders, payments, products, couriers, chat, fraud, …), but almost none of those features exist in
 * Lytro yet; listing them in a picker would just be confusing dead weight until each one ships its own
 * screen and starts checking its own permission.
 */
export const PERMISSION_OPTIONS: { value: Permission; labelKey: string }[] = [
  { value: Permission.StaffRead, labelKey: 'roles.permission.staffRead' },
  { value: Permission.StaffManage, labelKey: 'roles.permission.staffManage' },
  { value: Permission.AuditRead, labelKey: 'roles.permission.auditRead' },
];

/** The same set as PERMISSION_OPTIONS's values, as plain strings — for checking a RoleSummary's
    permissions: string[] (types/role.ts) against the scoped list without an enum/string comparison. */
export const KNOWN_PERMISSION_VALUES: ReadonlySet<string> = new Set(
  PERMISSION_OPTIONS.map((option) => option.value),
);
