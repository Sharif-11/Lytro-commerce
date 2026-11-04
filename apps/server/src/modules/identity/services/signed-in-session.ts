import { Inject, Injectable } from '@nestjs/common';
import { type SignInMethod, TenantState } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { StaffService } from '../../staff/services/staff.service';
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
    @Inject(StaffService) private readonly staff: StaffService,
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
    // TEN-31: a person who owns no shop but works in one lands on that shop, with their own sign-in.
    const staffShop = owned ? null : await this.staff.staffShopOfIn(tx, values.subscriberId);
    const staffTenantId = staffShop?.active === true ? staffShop.tenantId : null;
    const tenantId = owned?.id ?? staffTenantId;
    const hasPhone = (await this.gateway.findPhoneIdentityOf(tx, values.subscriberId)) !== null;
    const opened = await this.sessions.open(tx, {
      subscriberId: values.subscriberId,
      tenantId,
      mustSetPassword: values.mustSetPassword,
      signInMethod: values.signInMethod,
      context: values.context,
    });
    return {
      next: this.nextStep(values.mustSetPassword, owned, staffTenantId !== null, hasPhone),
      tenantId,
      cookie: opened.cookie,
      csrfToken: opened.csrfToken,
    };
  }

  private nextStep(
    mustSetPassword: boolean,
    owned: OwnedTenant | null,
    worksInShop: boolean,
    hasPhone: boolean,
  ): NextStep {
    if (mustSetPassword) return 'set-password';
    if (owned === null) {
      if (worksInShop) return 'dashboard';
      // AUTH-28 (amended 2026-10-31), TVR-01: a phone for every owner, before Create shop. A deleted shop's owner
      // is never `owned` either, and opens a new one the same way (LIF-21).
      return hasPhone ? 'create-shop' : 'verify-phone';
    }
    if (owned.suspendedAt !== null) return 'unavailable';
    if (owned.state === TenantState.Locked || owned.state === TenantState.Archived)
      return 'renewal';
    return 'dashboard';
  }
}
