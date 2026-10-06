import { Inject, Injectable } from '@nestjs/common';
import type { CreateShopInput } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { SlugService } from '../../tenancy/services/slug.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import { SessionService } from './session.service';
import { SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
import type { SessionRecord } from '../ports/session-store';
import type { SignupGateway } from '../ports/signup-gateway';
import type { SignupSettings } from '../ports/signup-settings';
import type { ShopCreated } from '../types/shop-created';

/** The create-shop step (AUTH-10, AUTH-11, AUTH-28, D13). */
@Injectable()
export class ShopCreationService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SIGNUP_SETTINGS) private readonly settings: SignupSettings,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(SlugService) private readonly slugs: SlugService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async createShop(session: SessionRecord, input: CreateShopInput): Promise<ShopCreated> {
    const shopName = input.shopName.trim();
    const ownerName = input.ownerName.trim();
    const address = await this.chooseAddress(shopName, input.address);

    try {
      const { tenantId, messages } = await this.gateway.run(async (tx) => {
        const existing = await this.gateway.findOwnedTenant(tx, session.subscriberId);
        if (existing !== null) {
          throw new ApiError('conflict', 'This account already has a shop.', {});
        }
        const identity = await this.gateway.findPhoneIdentityOf(tx, session.subscriberId);
        if (!identity) {
          throw new ApiError('unauthenticated', 'Sign in to continue.', {});
        }
        const created = await this.tenants.createTrialShop(tx, {
          identityId: identity.id,
          subscriberId: session.subscriberId,
          shopName,
          slug: address,
          ownerPhone: identity.phone,
          ownerName,
          liveUrl: this.settings.shopUrl(address),
        });
        await this.sessions.attachTenant(tx, session.id, created.tenantId);
        return created;
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
        throw new ApiError(
          'validation_error',
          'Use 3 to 30 lowercase letters, digits or hyphens for the address.',
          { field: 'address' },
        );
      }
      throw new ApiError('conflict', 'That address is taken.', {
        field: 'address',
        suggestion: check.suggestion,
      });
    }
    const suggestion = await this.slugs.suggest(shopName);
    if (!suggestion) {
      throw new ApiError('validation_error', 'Choose an address for your shop.', {
        field: 'address',
      });
    }
    return suggestion;
  }

  /** Turns a race that lost on the address constraint into an answer. */
  private async conflictFor(error: UniqueViolation, shopName: string): Promise<ApiError> {
    if (error.target === 'phone') {
      return new ApiError('conflict', 'This account already has a shop.', {});
    }
    return new ApiError('conflict', 'That address is taken.', {
      field: 'address',
      suggestion: await this.slugs.suggest(shopName),
    });
  }
}
