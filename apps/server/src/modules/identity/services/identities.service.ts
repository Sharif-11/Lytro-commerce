import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ChallengeChannel, ChallengeKind, IdentityKind } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { EmailFormat } from './email-format';
import { OneTimeCodeService } from './one-time-code.service';
import { OauthService } from './oauth.service';
import type { OauthAttached } from '../types/oauth';
import { PhoneNumberFormat } from './phone-number-format';
import { SignInLockout } from './sign-in-lockout';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';
import type { CodeIssued } from '../types/code-issued';
import type { IdentityDestination as Destination } from '../types/identity-destination';

/** The identities of a signed-in account: list, add and remove them (AUTH-08, AUTH-26). */
@Injectable()
export class IdentitiesService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
    @Inject(EmailFormat) private readonly emailFormat: EmailFormat,
    @Inject(OauthService) private readonly oauth: OauthService,
  ) {}

  list(subscriberId: string): Promise<{ id: string; kind: IdentityKind; value: string }[]> {
    return this.gateway.run((tx) => this.gateway.listIdentities(tx, subscriberId));
  }

  requestCode(kind: 'phone' | 'email', value: string): Promise<CodeIssued> {
    const target = this.destination(kind, value);
    return this.codes.issue(target.destination, target.channel, ChallengeKind.Signin);
  }

  async verifyAdd(
    subscriberId: string,
    kind: 'phone' | 'email',
    value: string,
    code: string,
  ): Promise<OauthAttached> {
    const target = this.destination(kind, value);
    await this.lockout.refuseIfLocked(subscriberId);

    let challengeId: string;
    try {
      challengeId = await this.codes.verify(
        target.destination,
        target.channel,
        code,
        ChallengeKind.Signin,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error') {
        await this.lockout.recordFailure(subscriberId, null);
      }
      throw error;
    }

    try {
      await this.gateway.run(async (tx) => {
        const consumed = await this.gateway.consumeChallenge(tx, challengeId, new Date());
        if (!consumed) {
          throw new ApiError('validation_error', 'This code has already been used.', {
            field: 'code',
          });
        }
        const holder = await this.gateway.findSubscriberByIdentity(
          tx,
          target.identityKind,
          target.destination,
        );
        if (holder !== null) throw this.cannotAdd();
        await this.gateway.insertIdentity(tx, {
          subscriberId,
          kind: target.identityKind,
          value: target.destination,
          verifiedAt: new Date(),
        });
      });
    } catch (error) {
      if (error instanceof UniqueViolation) throw this.cannotAdd();
      throw error;
    }
    return { attached: target.identityKind };
  }

  startProviderAdd(subscriberId: string, provider: string): Promise<{ url: string }> {
    return this.oauth.start(provider, subscriberId);
  }

  async remove(subscriberId: string, identityId: string): Promise<void> {
    if (!z.string().uuid().safeParse(identityId).success)
      throw new NotFoundException('Page not found.');
    const outcome = await this.gateway.run(async (tx) => {
      const identities = await this.gateway.listIdentities(tx, subscriberId);
      if (!identities.some((identity) => identity.id === identityId)) return 'not_found' as const;
      // AUTH-26: an account always keeps at least one way in.
      if (identities.length <= 1) return 'last' as const;
      return this.gateway.deleteIdentity(tx, subscriberId, identityId);
    });
    if (outcome === 'not_found') throw new NotFoundException('Page not found.');
    if (outcome === 'last') {
      throw new ApiError('conflict', 'Keep at least one way to sign in.', {});
    }
    if (outcome === 'owns_shop') {
      throw new ApiError('conflict', 'This identity owns your shop, so it cannot be removed.', {});
    }
  }

  private destination(kind: 'phone' | 'email', value: string): Destination {
    if (kind === 'phone') {
      const phone = this.phoneFormat.normalize(value);
      if (!phone) {
        throw new ApiError(
          'validation_error',
          'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.',
          {
            field: 'value',
          },
        );
      }
      return {
        destination: phone,
        channel: ChallengeChannel.Sms,
        identityKind: IdentityKind.Phone,
      };
    }
    const email = this.emailFormat.normalize(value);
    if (!email) {
      throw new ApiError('validation_error', 'Enter a valid email address.', { field: 'value' });
    }
    return {
      destination: email,
      channel: ChallengeChannel.Email,
      identityKind: IdentityKind.Email,
    };
  }

  private cannotAdd(): ApiError {
    return new ApiError('conflict', 'This cannot be added. Try another.', {});
  }
}
