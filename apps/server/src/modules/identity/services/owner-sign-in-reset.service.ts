import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  ChallengeChannel,
  ChallengeKind,
  FieldProblemCode,
  IdentityKind,
  PlatformActorType,
  PlatformAuditAction,
  TenantState,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { SignupGateway } from '../ports/signup-gateway';
import { SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
import type { SignupSettings } from '../ports/signup-settings';
import { OneTimeCodeService } from './one-time-code.service';
import { PhoneNumberFormat } from './phone-number-format';
import { SessionService } from './session.service';

const PHONE_ENDING_DIGITS = 3;

/**
 * ADM-04, D8-5, D8-36 (Phase 8 Slice 8.3, read agreed 2026-11-08): the operator, having checked it is really the owner,
 * resets their sign-in. The phone they gave replaces the account's at once, so a lost one can't sign in again; every
 * session of the account ends; and a reset code goes to that phone, which the owner enters on the forgot-password page.
 * The operator never sees or sets a password. Audited in both logs, the shop's showing only the number's end.
 */
@Injectable()
export class OwnerSignInResetService {
  constructor(
    @Inject(TenantSummaries) private readonly tenants: TenantSummaries,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SIGNUP_SETTINGS) private readonly clock: SignupSettings,
    @Inject(PhoneNumberFormat) private readonly phones: PhoneNumberFormat,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  async reset(input: {
    tenantId: string;
    phone: string;
    reason: string;
    operatorId: string;
    ip: string | null;
  }): Promise<{ phoneChanged: boolean }> {
    const phone = this.phones.normalize(input.phone);
    if (phone === null) {
      throw new FieldsError([{ field: 'phone', problem: FieldProblemCode.InvalidFormat }]);
    }
    const shop = await this.tenants.findById(input.tenantId);
    if (!shop) throw new ApiError('not_found', 'ShopNotFound', {});
    if (shop.state === TenantState.Deleted) {
      throw new ApiError('conflict', 'ShopAlreadyDeleted', {});
    }
    const subscriberId = shop.ownerSubscriberId;
    const now = this.clock.now();

    const phoneChanged = await this.gateway.run(async (tx) => {
      const holder = await this.gateway.findSubscriberByIdentity(tx, IdentityKind.Phone, phone);
      if (holder !== null && holder.subscriberId !== subscriberId) {
        throw new ApiError('conflict', 'OwnerResetPhoneTaken', {});
      }
      const current = await this.gateway.findPhoneIdentityOf(tx, subscriberId);
      const changed = current?.phone !== phone;
      if (changed) {
        if (current === null) {
          await this.gateway.insertPhoneIdentity(tx, { subscriberId, phone, verifiedAt: now });
        } else {
          await this.gateway.changePhoneIdentity(tx, current.id, phone, now);
        }
        await this.staff.setOwnerPhoneIn(tx, shop.id, phone);
      }
      await this.sessions.revokeEverySession(tx, subscriberId, now);
      await this.audit.record(tx, {
        tenantId: shop.id,
        actorType: ActorType.PlatformSupport,
        actorId: null, // AUD-08: never the operator's own id; the platform audit log keeps who it was.
        action: AuditAction.OwnerSignInReset,
        ip: input.ip,
        targetType: 'tenant',
        targetId: shop.id,
        result: AuditResult.Success,
        summary: {
          reason: input.reason,
          phoneChanged: changed,
          phoneEnding: phone.slice(-PHONE_ENDING_DIGITS),
        },
      });
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: input.operatorId,
        action: PlatformAuditAction.OwnerSignInReset,
        targetType: 'tenant',
        targetId: shop.id,
        result: AuditResult.Success,
        ip: input.ip,
        summary: {
          reason: input.reason,
          phoneChanged: changed,
          from: current?.phone ?? null,
          to: phone,
        },
      });
      return changed;
    });

    // After the commit, as every code is: it reaches the phone that is now the account's. Lytro's own cost, and not
    // counted against the operator's address (D8-38).
    await this.codes.issue(phone, ChallengeChannel.Sms, ChallengeKind.Reset, {
      countedTo: null,
      ip: null,
    });
    return { phoneChanged };
  }
}
