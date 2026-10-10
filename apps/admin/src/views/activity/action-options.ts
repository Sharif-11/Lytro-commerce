import { AuditAction } from '@lytronix/validators';

/** Every value AuditAction can hold (apps/server's own exhaustive log), each mapped to its i18n key — kept as
    a string-keyed lookup table, not a switch over the enum, so a new action added to the enum without a
    matching entry here just shows its raw snake_case string instead of crashing the Activity screen (and so
    an ActivityEntry's own plain-string `action` field, types/activity.ts's deliberate structural duplicate
    of the server's view, can look itself up without a cast). */
const ACTION_LABEL_KEYS: Record<string, string> = {
  [AuditAction.SignIn]: 'activity.action.signIn',
  [AuditAction.SignInFailed]: 'activity.action.signInFailed',
  [AuditAction.SignOut]: 'activity.action.signOut',
  [AuditAction.PasswordChanged]: 'activity.action.passwordChanged',
  [AuditAction.PasswordReset]: 'activity.action.passwordReset',
  [AuditAction.StaffCreated]: 'activity.action.staffCreated',
  [AuditAction.StaffUpdated]: 'activity.action.staffUpdated',
  [AuditAction.StaffDeactivated]: 'activity.action.staffDeactivated',
  [AuditAction.StaffReactivated]: 'activity.action.staffReactivated',
  [AuditAction.RoleCreated]: 'activity.action.roleCreated',
  [AuditAction.RoleUpdated]: 'activity.action.roleUpdated',
  [AuditAction.RoleDeleted]: 'activity.action.roleDeleted',
};

export const ACTION_OPTIONS: { value: AuditAction; labelKey: string }[] = Object.values(
  AuditAction,
).map((value) => ({ value, labelKey: ACTION_LABEL_KEYS[value] ?? value }));

export function actionLabelKey(action: string): string | null {
  return ACTION_LABEL_KEYS[action] ?? null;
}
