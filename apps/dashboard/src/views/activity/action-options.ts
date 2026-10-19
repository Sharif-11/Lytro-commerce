import { AuditAction } from '@lytronix/validators';

/** Every AuditAction value mapped to its copy key; an action without an entry shows its raw name instead of
    breaking the screen. */
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

export const ACTION_OPTIONS: { value: AuditAction; labelKey: string | null }[] = Object.values(
  AuditAction,
).map((value) => ({ value, labelKey: ACTION_LABEL_KEYS[value] ?? null }));

export function actionLabelKey(action: string): string | null {
  return ACTION_LABEL_KEYS[action] ?? null;
}
