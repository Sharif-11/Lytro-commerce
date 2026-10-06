import { Inject, Injectable } from '@nestjs/common';
import { type SignInMethod, TenantState } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { type SessionContext, SessionService } from './session.service';
import { SIGNUP_GATEWAY } from '../tokens';
import type { OwnedTenant, SignupGateway } from '../ports/signup-gateway';

/** Where the client goes after sign-in (AUTH-22, AUTH-23, AUTH-28). */
export type NextStep =
  'create-shop' | 'dashboard' | 'set-password' | 'renewal' | 'purchase' | 'unavailable';

export interface SignedIn {
  next: NextStep;
  tenantId: string | null;
  cookie: string;
  csrfToken: string;
}

/**
 * Opens a session for a subscriber who has just proved their identity, and says where the client goes next.
 * Runs inside the caller's unit of work so the session and the sign-in bookkeeping commit together.
 */
@Injectable()
export class SignedInSession {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async open(
    tx: Transaction,
    values: {
      subscriberId: string;
      signInMethod: SignInMethod;
      mustSetPassword: boolean;
      context: SessionContext;
    },
  ): Promise<SignedIn> {
    await this.gateway.markSignedIn(tx, values.subscriberId, new Date());
    const owned = await this.gateway.findOwnedTenant(tx, values.subscriberId);
    const tenantId = owned?.id ?? null;
    const opened = await this.sessions.open(tx, {
      subscriberId: values.subscriberId,
      tenantId,
      mustSetPassword: values.mustSetPassword,
      signInMethod: values.signInMethod,
      context: values.context,
    });
    return {
      next: nextStep(values.mustSetPassword, owned),
      tenantId,
      cookie: opened.cookie,
      csrfToken: opened.csrfToken,
    };
  }
}

function nextStep(mustSetPassword: boolean, owned: OwnedTenant | null): NextStep {
  if (mustSetPassword) return 'set-password';
  if (owned === null) return 'create-shop';
  if (owned.suspendedAt !== null) return 'unavailable';
  if (owned.state === TenantState.Locked || owned.state === TenantState.Archived) return 'renewal';
  if (owned.state === TenantState.Deleted) return 'purchase';
  return 'dashboard';
}
