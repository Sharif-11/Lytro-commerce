import { Inject, Injectable } from '@nestjs/common';
import type { CreateShopInput } from '@lytronix/validators';
import { FieldProblemCode, ServerFieldProblemCode } from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { BalanceService } from '../../balance/services/balance.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { SlugService } from '../../tenancy/services/slug.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import { LegalAcceptance } from './legal-acceptance';
import { SessionService } from './session.service';
import { TrialLimiter } from './trial-limiter';
import { SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
import type { SessionRecord } from '../ports/session-store';
import type { SignupGateway } from '../ports/signup-gateway';
import type { SignupSettings } from '../ports/signup-settings';
import type { ShopCreated } from '../types/shop-created';

/**
 * The create-shop step (AUTH-10, AUTH-11, AUTH-28, D13). It needs the owner's verified phone, whatever they signed up
 * with (TVR-01). An owner whose shop was deleted comes back here and opens a new one (LIF-21), bringing the old shop's
 * balance along.
 */
@Injectable()
export class ShopCreationService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SIGNUP_SETTINGS) private readonly settings: SignupSettings,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(SlugService) private readonly slugs: SlugService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(TrialLimiter) private readonly trialLimiter: TrialLimiter,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(LegalAcceptance) private readonly acceptance: LegalAcceptance,
  ) {}

  async createShop(
    session: SessionRecord,
    input: CreateShopInput,
    ip: string | null,
  ): Promise<ShopCreated> {
    const shopName = input.shopName.trim();
    const ownerName = input.ownerName.trim();
    const address = await this.chooseAddress(shopName, input.address);

    try {
      const { tenantId, messages } = await this.gateway.run(async (tx) => {
        const existing = await this.gateway.findOwnedTenant(tx, session.subscriberId);
        if (existing !== null) {
          throw new ApiError('conflict', 'ShopAlreadyExists', {});
        }
        const phone = await this.gateway.findPhoneIdentityOf(tx, session.subscriberId);
        // AUTH-28 (amended 2026-10-31): someone verified by Google, Facebook or email gives a phone first.
        if (phone === null) {
          throw new ApiError('forbidden', 'VerifyPhoneToContinue', { next: 'verify-phone' });
        }
        const email = await this.gateway.findEmailIdentityOf(tx, session.subscriberId);
        await this.trialLimiter.refuseIfTooMany(tx, phone.id, ip);
        // LEG-01: staff an owner added first see the entry screen's line on their way to a shop of their own.
        await this.gateway.recordAcceptance(tx, session.subscriberId, await this.acceptance.now());
        const created = await this.tenants.createTrialShop(tx, {
          identityId: phone.id,
          subscriberId: session.subscriberId,
          shopName,
          slug: address,
          ownerPhone: phone.phone,
          ownerEmail: email?.email ?? null,
          ownerName,
          dashboardUrl: this.settings.dashboardUrl(address),
        });
        await this.sessions.attachTenant(tx, session.id, created.tenantId);
        await this.trialLimiter.record(tx, phone.id, ip);
        await this.balance.carryOverFromDeletedShops(tx, session.subscriberId, created.tenantId);
        return { tenantId: created.tenantId, messages: created.messages };
      });

      await this.messaging.dispatch(messages);
      return { tenantId, address, shopUrl: this.settings.shopUrl(address), next: 'set-password' };
    } catch (error) {
      if (error instanceof UniqueViolation) throw await this.conflictFor(error, shopName);
      throw error;
    }
  }

  /** Uses the typed address, or the suggestion from the shop name (AUTH-11). */
  private async chooseAddress(shopName: string, typed: string | undefined): Promise<string> {
    if (typed !== undefined && typed.trim() !== '') {
      const check = await this.slugs.checkAddress(typed.trim());
      if (check.ok) return check.address;
      if (check.reason === 'format') {
        throw new FieldsError([{ field: 'address', problem: FieldProblemCode.InvalidFormat }]);
      }
      throw this.addressTaken(check.suggestion);
    }
    const suggestion = await this.slugs.suggest(shopName);
    if (!suggestion) {
      throw new FieldsError([
        { field: 'address', problem: FieldProblemCode.Required, messageKey: 'AddressRequired' },
      ]);
    }
    return suggestion;
  }

  /** Turns a race that lost on the address constraint into an answer. */
  private async conflictFor(error: UniqueViolation, shopName: string): Promise<ApiError> {
    if (error.target === 'phone') {
      return new ApiError('conflict', 'ShopAlreadyExists', {});
    }
    return this.addressTaken(await this.slugs.suggest(shopName));
  }

  /** AUTH-11: a taken address, with the next free one to try when there is one. */
  private addressTaken(suggestion: string | null): FieldsError {
    return new FieldsError(
      [
        {
          field: 'address',
          problem: ServerFieldProblemCode.Taken,
          ...(suggestion === null
            ? { messageKey: 'AddressTaken' as const }
            : { messageKey: 'AddressTakenTry' as const, params: { suggestion } }),
        },
      ],
      'conflict',
      { suggestion },
    );
  }
}
