import { Inject, Injectable } from '@nestjs/common';
import type { CreateShopInput } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { MailService } from '../../shared/mail/services/mail.service';
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
    @Inject(MailService) private readonly mail: MailService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async createShop(session: SessionRecord, input: CreateShopInput): Promise<ShopCreated> {
    const shopName = input.shopName.trim();
    const ownerName = input.ownerName.trim();
    const address = await this.chooseAddress(shopName, input.address);

    try {
      const { tenantId, messages, emailMessage } = await this.gateway.run(async (tx) => {
        const existing = await this.gateway.findOwnedTenant(tx, session.subscriberId);
        if (existing !== null) {
          throw new ApiError('conflict', 'This account already has a shop.', {});
        }
        const phone = await this.gateway.findPhoneIdentityOf(tx, session.subscriberId);
        const email = await this.gateway.findEmailIdentityOf(tx, session.subscriberId);
        // A Google/Facebook-only sign-up (AUTH-24) has neither — it creates only an oauth-kind identity,
        // never a separate phone/email row (AUTH-08's channels stay independent). Fall back to any identity
        // the subscriber has rather than requiring phone/email specifically; ownerPhone/ownerEmail staying
        // null for that case is already handled downstream (no SMS/email queued, just no contact channel yet).
        const ownerIdentityId =
          phone?.id ??
          email?.id ??
          (await this.gateway.listIdentities(tx, session.subscriberId))[0]?.id ??
          null;
        if (ownerIdentityId === null) {
          throw new ApiError('unauthenticated', 'Sign in to continue.', {});
        }
        const created = await this.tenants.createTrialShop(tx, {
          identityId: ownerIdentityId,
          subscriberId: session.subscriberId,
          shopName,
          slug: address,
          ownerPhone: phone?.phone ?? null,
          ownerEmail: email?.email ?? null,
          ownerName,
          liveUrl: this.settings.shopUrl(address),
        });
        await this.sessions.attachTenant(tx, session.id, created.tenantId);
        // The shop-ready text goes to the phone; an owner with no phone is told by email (AUTH-27). Queued in
        // this same transaction, same as the text, so a flaky mail provider gets the same outbox retry (D28).
        const emailMessage =
          phone === null && email !== null
            ? await this.mail.queueShopReady(tx, email.email, this.settings.shopUrl(address))
            : null;
        return { tenantId: created.tenantId, messages: created.messages, emailMessage };
      });

      await this.messaging.dispatch(messages);
      if (emailMessage !== null) await this.mail.dispatch([emailMessage]);
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
