import { enumTuple, IdentityKind, TenantState } from '@lytronix/validators';
import { control } from './shared';

// Postgres enums, built from the shared enums in @lytronix/validators so the values are defined once.
export const identityKind = control.enum('identity_kind', enumTuple(Object.values(IdentityKind)));
export const tenantState = control.enum('tenant_state', enumTuple(Object.values(TenantState)));
