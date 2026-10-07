import { Inject, Injectable } from '@nestjs/common';
import { SignInMethod } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { LAPSED } from '../../identity/guards/dashboard.guard';
import type { SessionContext } from '../../identity/types/session';
import type { SignedIn } from '../../identity/types/signed-in';
import { PasswordHasher } from '../../identity/services/password-hasher';
import { PhoneNumberFormat } from '../../identity/services/phone-number-format';
import { SessionService } from '../../identity/services/session.service';
import { SignInLockout } from '../../identity/services/sign-in-lockout';
import { StaffService } from '../../staff/services/staff.service';
import type { ShopForSignin } from '../types/shop-for-signin';

/**
 * Staff sign-in on the shop's own host, with the password the owner set for them (STF-01, AUTH-12, AUTH-13, AUTH-14).
 * The account password of the person is never used here; the staff password is kept on the staff row.
 */
@Injectable()
export class StaffSigninService {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(PhoneNumberFormat) private readonly phones: PhoneNumberFormat,
  ) {}

  async signIn(
    shop: ShopForSignin,
    rawPhone: string,
    password: string,
    context: SessionContext,
  ): Promise<SignedIn> {
    const phone = this.phones.normalize(rawPhone);
    const member = phone === null ? null : await this.staff.credentialsByPhone(shop, phone);
    const subscriberId = member?.subscriberId ?? null;
    await this.lockout.refuseIfLocked(subscriberId);

    const hash = member?.passwordHash ?? null;
    const matches =
      hash === null
        ? await this.hasher.verifyAbsent(password)
        : await this.hasher.verify(password, hash);
    if (member === null || subscriberId === null || member.isOwner || !member.active || !matches) {
      await this.lockout.recordFailure(subscriberId, context.ip);
      throw new ApiError('unauthenticated', 'That phone number and password do not match.', {});
    }
    if (shop.suspendedAt !== null || LAPSED.has(shop.state)) {
      throw new ApiError('tenant_offline', 'This shop is not available right now.', {});
    }

    const opened = await this.staff.inShop(shop, (tx) =>
      this.sessions.open(tx, {
        subscriberId,
        tenantId: shop.id,
        userId: member.userId,
        mustSetPassword: false,
        signInMethod: SignInMethod.Password,
        context,
      }),
    );
    return {
      next: 'dashboard',
      tenantId: shop.id,
      cookie: opened.cookie,
      csrfToken: opened.csrfToken,
    };
  }
}
