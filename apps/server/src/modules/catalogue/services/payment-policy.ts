import { FieldProblemCode, PaymentPolicy } from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';

/** A payment policy with the advance it asks: only a partial advance has one (PRD-08). */
export interface PolicyWithAdvance<P extends PaymentPolicy | null> {
  policy: P;
  advance: string | null;
}

/**
 * PRD-08: the policy and advance a change leaves, from what is stored and what the request gives. Either may change
 * alone, so the rule (a partial advance needs an amount, nothing else takes one) is checked on the result, and the
 * refusal names `advanceField`.
 */
export function settlePaymentPolicy<P extends PaymentPolicy | null>(
  current: PolicyWithAdvance<P>,
  input: { policy?: P; advance?: number | null },
  advanceField: string,
): PolicyWithAdvance<P> {
  const policy = input.policy !== undefined ? input.policy : current.policy;
  const partial = policy === PaymentPolicy.PartialAdvance;
  const advance =
    input.advance !== undefined
      ? input.advance === null
        ? null
        : input.advance.toFixed(2)
      : partial
        ? current.advance
        : null;
  if (partial && advance === null) {
    throw new FieldsError([{ field: advanceField, problem: FieldProblemCode.Required }]);
  }
  if (!partial && advance !== null) {
    throw new FieldsError([{ field: advanceField, problem: FieldProblemCode.NotAllowed }]);
  }
  return { policy, advance };
}
