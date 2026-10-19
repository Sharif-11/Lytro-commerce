import { Permission } from '@lytronix/validators';

/** The permissions the editor offers: those that gate a live screen, each with a label and, where the
    consequence matters, a sub-line (STF-07). The others join when their sections ship. */
export const PERMISSION_OPTIONS: { value: Permission; labelKey: string; noteKey: string | null }[] =
  [
    { value: Permission.StaffRead, labelKey: 'team.permission.staffRead', noteKey: null },
    {
      value: Permission.StaffManage,
      labelKey: 'team.permission.staffManage',
      noteKey: 'team.permissionNote.staffManage',
    },
    { value: Permission.BalanceRead, labelKey: 'team.permission.balanceRead', noteKey: null },
    {
      value: Permission.BalanceManage,
      labelKey: 'team.permission.balanceManage',
      noteKey: 'team.permissionNote.balanceManage',
    },
    { value: Permission.PaymentsRead, labelKey: 'team.permission.paymentsRead', noteKey: null },
    {
      value: Permission.PaymentsManage,
      labelKey: 'team.permission.paymentsManage',
      noteKey: 'team.permissionNote.paymentsManage',
    },
    { value: Permission.AuditRead, labelKey: 'team.permission.auditRead', noteKey: null },
    { value: Permission.SettingsManage, labelKey: 'team.permission.settingsManage', noteKey: null },
  ];

export function permissionLabelKey(value: string): string | null {
  return PERMISSION_OPTIONS.find((option) => (option.value as string) === value)?.labelKey ?? null;
}
