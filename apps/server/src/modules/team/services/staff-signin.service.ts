import { Inject, Injectable } from '@nestjs/common';
import { ActorType, AuditAction, AuditResult, SignInMethod } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { LAPSED } from '../../identity/guards/dashboard.guard';
import type { SessionContext } from '../../identity/types/session';
import type { SignedIn } from '../../identity/types/signed-in';
import type { SessionRecord } from '../../identity/ports/session-store';
import { PasswordHasher } from '../../identity/services/password-hasher';
import { PhoneNumberFormat } from '../../identity/services/phone-number-format';
import { SessionService } from '../../identity/services/session.service';
import { SignInLockout } from '../../identity/services/sign-in-lockout';
import { StaffService } from '../../staff/services/staff.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';

/**
 * Staff sign-in at app.lytro.app/staff-sign-in, with the password the owner set for them (AUTH-31, STF-01, AUTH-12,
 * AUTH-13, AUTH-14). The phone finds the one shop the person is staff in (STF-06), so no shop host is needed. The
 * account password of the person is never used here; the staff password is kept on the staff row.
 */
@Injectable()
export class StaffSigninService {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(PhoneNumberFormat) private readonly phones: PhoneNumberFormat,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TenantSummaries) private readonly summaries: TenantSummaries,
  ) {}

  async signIn(rawPhone: string, password: string, context: SessionContext): Promise<SignedIn> {
    const phone = this.phones.normalize(rawPhone);
    const staffShop = phone === null ? null : await this.staff.staffShopByPhone(phone);
    const shop = staffShop === null ? null : await this.summaries.findById(staffShop.tenantId);
    const member =
      phone === null || shop === null ? null : await this.staff.credentialsByPhone(shop, phone);
    const subscriberId = member?.subscriberId ?? null;
    await this.lockout.refuseIfLocked(subscriberId);

    const hash = member?.passwordHash ?? null;
    const matches =
      hash === null
        ? await this.hasher.verifyAbsent(password)
        : await this.hasher.verify(password, hash);
    if (
      shop === null ||
      member === null ||
      subscriberId === null ||
      member.isOwner ||
      !member.active ||
      !matches
    ) {
      await this.lockout.recordFailure(subscriberId, context.ip);
      // A phone with no staff row anywhere has no shop to log the attempt in.
      if (shop !== null) {
        await this.audit.recordStandalone({
          tenantId: shop.id,
          actorType: ActorType.User,
          actorId: member?.userId ?? null,
          action: AuditAction.SignInFailed,
          result: AuditResult.Failure,
          ip: context.ip,
        });
      }
      throw new ApiError('unauthenticated', 'PhoneOrPasswordWrong', {});
    }
    if (shop.suspendedAt !== null || LAPSED.has(shop.state)) {
      throw new ApiError('tenant_offline', 'ShopUnavailable', {});
    }

    const opened = await this.staff.inShop(shop, (tx) =>
      this.sessions.open(tx, {
        subscriberId,
        tenantId: shop.id,
        userId: member.userId,
        mustSetPassword: member.mustSetPassword,
        signInMethod: SignInMethod.Password,
        context,
      }),
    );
    await this.audit.recordStandalone({
      tenantId: shop.id,
      actorType: ActorType.User,
      actorId: member.userId,
      action: AuditAction.SignIn,
      result: AuditResult.Success,
      ip: context.ip,
    });
    return {
      next: member.mustSetPassword ? 'set-password' : 'dashboard',
      tenantId: shop.id,
      cookie: opened.cookie,
      csrfToken: opened.csrfToken,
    };
  }

  /** A staff member changes their own password, then their current session stops being forced to change it. */
  async changeOwnPassword(
    session: SessionRecord,
    input: { currentPassword?: string; newPassword: string },
    ip?: string | null,
  ): Promise<void> {
    if (session.userId === null || session.tenantId === null) {
      throw new ApiError('forbidden', 'RequestNotAccepted', {});
    }
    const shop = { id: session.tenantId, planLimits: null };
    await this.staff.changePassword(shop.id, session.userId, input, session.mustSetPassword, ip);
    await this.staff.inShop(shop, (tx) => this.sessions.clearMustSetPassword(tx, session));
  }
}
