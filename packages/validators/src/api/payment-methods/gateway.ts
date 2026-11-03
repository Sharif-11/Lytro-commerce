import { z } from 'zod';
import { GATEWAY_FIELD_MAX_LENGTH } from '../../common/limits';
import { PaymentWay } from '../../db/enums';

const field = z.string().trim().min(1).max(GATEWAY_FIELD_MAX_LENGTH);

/**
 * WAL-09, SEC-08 (Phase 5 Slice 5.7): a wallet account's gateway credentials, only ever in a request's body; sealed as they
 * arrive and never returned. `sandbox` chooses the gateway's test environment.
 */
export const gatewayCredentialsSchema = z
  .object({
    appKey: field,
    appSecret: field,
    username: field,
    password: field,
    sandbox: z.boolean(),
  })
  .strict();
export type GatewayCredentialsInput = z.infer<typeof gatewayCredentialsSchema>;

/** PAY-06 (amended 2026-11-03, Slice 5.7 read): how the shop takes a wallet's payments. */
export const paymentWaySchema = z.object({ way: z.nativeEnum(PaymentWay) }).strict();
export type PaymentWayInput = z.infer<typeof paymentWaySchema>;
