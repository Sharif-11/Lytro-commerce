import { z } from 'zod';
import { AuditAction, AuditResult } from '../../../db/enums';

// One action or several, comma-separated (`action=sign_in,sign_out`): an Activity chip covers a group of actions
// (ACTIVITY_GROUPS), filtered on the server so a page is never empty while older matches exist (Slice 11.6).
const auditActionsField = z
  .string()
  .transform((value) => value.split(','))
  .pipe(z.array(z.nativeEnum(AuditAction)).min(1));

// GET activity: filters for the Activity page (AUD-04). Keyset pagination, never OFFSET.
export const listActivitySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  actorId: z.string().uuid().optional(),
  action: auditActionsField.optional(),
  // "Failed only": the entries whose result was a failure (AUD-02).
  result: z.nativeEnum(AuditResult).optional(),
  // Opaque: the created-at and id of the last row the caller saw.
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListActivityQuery = z.infer<typeof listActivitySchema>;

/**
 * AUD-04: the Activity page's chips, each a group of actions, defined once for the dashboard that sends them and the
 * tests that hold them to the log's actions. Actions in no group show under All; Failed is the `result` filter.
 */
export const ACTIVITY_GROUPS = {
  signIns: [
    AuditAction.SignIn,
    AuditAction.SignInFailed,
    AuditAction.SignOut,
    AuditAction.PasswordChanged,
    AuditAction.PasswordReset,
  ],
  staff: [
    AuditAction.StaffCreated,
    AuditAction.StaffUpdated,
    AuditAction.StaffDeactivated,
    AuditAction.StaffReactivated,
    AuditAction.RoleCreated,
    AuditAction.RoleUpdated,
    AuditAction.RoleDeleted,
  ],
  money: [
    AuditAction.PlanAssigned,
    AuditAction.PlanPurchased,
    AuditAction.PlanRenewed,
    AuditAction.PlanUpgraded,
    AuditAction.PlanPaymentCancelled,
    AuditAction.PlanPaymentRejected,
    AuditAction.AutoRenewToggled,
    AuditAction.AddonPurchased,
    AuditAction.AddonRenewalSet,
    AuditAction.AddonNotRenewed,
    AuditAction.AddonLapsed,
    AuditAction.PackAutoBuySet,
    AuditAction.PackAutoBuyFailed,
    AuditAction.BalanceToppedUp,
    AuditAction.BalanceAdjusted,
    AuditAction.DowngradeScheduled,
    AuditAction.DowngradeCancelled,
    AuditAction.DowngradeApplied,
    AuditAction.PayAsYouGoScheduled,
    AuditAction.PayAsYouGoCancelled,
    AuditAction.PayAsYouGoApplied,
    AuditAction.SubscriptionCancelled,
    AuditAction.SubscriptionCancellationUndone,
    AuditAction.PlanLimitOverrideSet,
    AuditAction.PlanLimitOverrideRemoved,
  ],
  stock: [
    AuditAction.ProductCreated,
    AuditAction.ProductUpdated,
    AuditAction.ProductVariantsSaved,
    AuditAction.ProductSlugChanged,
    AuditAction.ProductDeleted,
    AuditAction.ProductImagesSaved,
    AuditAction.ProductVideoSaved,
    AuditAction.MediaDeleted,
    AuditAction.CategoryCreated,
    AuditAction.CategoryUpdated,
    AuditAction.CategoryDeleted,
    AuditAction.AttributeCreated,
    AuditAction.AttributeUpdated,
    AuditAction.OptionSetCreated,
    AuditAction.OptionSetDeleted,
    AuditAction.StockAdjusted,
    AuditAction.VariantCostSet,
    AuditAction.StockChecked,
    AuditAction.SerialsAdded,
    AuditAction.SerialCorrected,
    AuditAction.SerialRemoved,
    AuditAction.SupplierCreated,
    AuditAction.SupplierUpdated,
    AuditAction.PurchaseCreated,
    AuditAction.PurchaseUpdated,
    AuditAction.PurchasePlaced,
    AuditAction.PurchaseCancelled,
    AuditAction.PurchaseDeleted,
    AuditAction.PurchaseReceived,
    AuditAction.PurchaseClosedShort,
  ],
} as const satisfies Record<string, readonly AuditAction[]>;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;
