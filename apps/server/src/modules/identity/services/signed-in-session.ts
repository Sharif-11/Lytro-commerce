import { Inject, Injectable } from '@nestjs/common';
import { type SignInMethod, TenantState } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { SessionService } from './session.service';
import type { SessionContext } from '../types/session';
import type { NextStep, SignedIn } from '../types/signed-in';
import { SIGNUP_GATEWAY } from '../tokens';
import type { OwnedTenant, SignupGateway } from '../ports/signup-gateway';

/** Opens a session for a subscriber who has just proved their identity, and says where the client goes next. */
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
      next: this.nextStep(values.mustSetPassword, owned),
      tenantId,
      cookie: opened.cookie,
      csrfToken: opened.csrfToken,
    };
  }

  private nextStep(mustSetPassword: boolean, owned: OwnedTenant | null): NextStep {
    if (mustSetPassword) return 'set-password';
    if (owned === null) return 'create-shop';
    if (owned.suspendedAt !== null) return 'unavailable';
    if (owned.state === TenantState.Locked || owned.state === TenantState.Archived)
      return 'renewal';
    if (owned.state === TenantState.Deleted) return 'purchase';
    return 'dashboard';
  }
}
