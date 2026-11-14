import { z } from 'zod';
import { OPERATOR_REASON_MAX_LENGTH } from '../../common/limits';
import { textField } from '../../common/text';

// POST /operator/tenants/:id/suspend (LIF-24): an operator's cause, recorded with the suspension.
export const suspendTenantSchema = z.object({
  reason: textField(OPERATOR_REASON_MAX_LENGTH),
});
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;

// POST /operator/tenants/:id/restore, POST /operator/tenants/:id/payment-page/restore and DELETE
// /operator/tenants/:tenantId/limit-overrides/:limitKey (Phase 8 exit criterion 5): undoing an operator's action takes a
// reason too, the suspension's own field, and it goes on both audit logs.
export const undoReasonSchema = z.object({ reason: suspendTenantSchema.shape.reason });
export type UndoReasonInput = z.infer<typeof undoReasonSchema>;
