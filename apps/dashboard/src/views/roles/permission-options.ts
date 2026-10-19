import { Permission } from '@lytronix/validators';

/** Only the permissions that gate a live screen are offered (the enum covers the platform's eventual
    scope); a permission joins the picker when its screen ships. */
export const PERMISSION_OPTIONS: { value: Permission; labelKey: string }[] = [
  { value: Permission.StaffRead, labelKey: 'roles.permission.staffRead' },
  { value: Permission.StaffManage, labelKey: 'roles.permission.staffManage' },
  { value: Permission.AuditRead, labelKey: 'roles.permission.auditRead' },
  { value: Permission.BalanceRead, labelKey: 'roles.permission.balanceRead' },
  { value: Permission.BalanceManage, labelKey: 'roles.permission.balanceManage' },
  { value: Permission.PaymentsRead, labelKey: 'roles.permission.paymentsRead' },
  { value: Permission.PaymentsManage, labelKey: 'roles.permission.paymentsManage' },
  { value: Permission.SettingsManage, labelKey: 'roles.permission.settingsManage' },
];

export const KNOWN_PERMISSION_VALUES: ReadonlySet<string> = new Set(
  PERMISSION_OPTIONS.map((option) => option.value),
);
