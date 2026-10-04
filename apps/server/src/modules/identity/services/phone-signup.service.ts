import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { SlugService } from '../../tenancy/services/slug.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { CompleteSignupInput } from '@lytronix/validators';
import { PhoneNumberFormat } from './phone-number-format';
import { OneTimeCodeService, type CodeIssued } from './one-time-code.service';
import { SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
import type { SignupGateway, SignupSettings } from './ports';

export interface ShopCreated {
  tenantId: string;
  address: string;
  shopUrl: string;
}

/**
 * Sign-up by phone (AUTH-01, AUTH-04 to AUTH-10). It checks the code, picks the address, then creates the
 * subscriber, the verified phone, the trial shop and its owner in one unit of work, and sends the messages only
 * after that unit commits.
 */
@Injectable()
export class PhoneSignupService {
  constructor(
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(SlugService) private readonly slugs: SlugService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SIGNUP_SETTINGS) private readonly settings: SignupSettings,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
  ) {}

  async requestCode(rawPhone: string): Promise<CodeIssued> {
    return this.codes.issue(this.requirePhone(rawPhone));
  }

  async createShop(input: CompleteSignupInput): Promise<ShopCreated> {
    const phone = this.requirePhone(input.phone);
    const challengeId = await this.codes.verify(phone, input.code);
    const shopName = input.shopName.trim();
    const ownerName = input.ownerName.trim();
    const address = await this.chooseAddress(shopName, input.address);

    try {
      const { tenantId, messages } = await this.gateway.run(async (tx) => {
        const consumed = await this.gateway.consumeChallenge(tx, challengeId, this.settings.now());
        if (!consumed) {
          throw new ApiError('validation_error', 'This code has already been used.', {
            field: 'code',
          });
        }
        const subscriberId = await this.gateway.insertSubscriber(tx);
        const identityId = await this.gateway.insertPhoneIdentity(tx, {
          subscriberId,
          phone,
          verifiedAt: this.settings.now(),
        });
        return this.tenants.createTrialShop(tx, {
          identityId,
          subscriberId,
          shopName,
          slug: address,
          ownerPhone: phone,
          ownerName,
          liveUrl: this.settings.shopUrl(address),
        });
      });

      await this.messaging.dispatch(messages);
      return { tenantId, address, shopUrl: this.settings.shopUrl(address) };
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

  /** Turns a race that lost on a unique constraint into an answer. The phone reply is deliberately vague. */
  private async conflictFor(error: UniqueViolation, shopName: string): Promise<ApiError> {
    if (error.target === 'phone') {
      return new ApiError('conflict', 'Sign in to continue.', {});
    }
    return new ApiError('conflict', 'That address is taken.', {
      field: 'address',
      suggestion: await this.slugs.suggest(shopName),
    });
  }

  private requirePhone(raw: string): string {
    const phone = this.phoneFormat.normalize(raw);
    if (!phone) {
      throw new ApiError(
        'validation_error',
        'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.',
        { field: 'phone' },
      );
    }
    return phone;
  }
}
