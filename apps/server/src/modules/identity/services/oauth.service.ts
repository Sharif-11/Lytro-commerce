import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  AuditAction,
  AuditResult,
  IdentityKind,
  OauthProvider,
  SignInMethod,
} from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { ENV } from '../../../config/tokens';
import type { Env } from '../../../config/env';
import { MINUTE_MS } from '../../../common/time';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { SignedInSession } from './signed-in-session';
import { SignInAudit } from './sign-in-audit';
import type { SessionContext } from '../types/session';
import type { OauthAttached, OauthSignedIn } from '../types/oauth';
import { OAUTH_PROVIDERS, OAUTH_STATE_STORE, SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
import type { OauthProviderPort } from '../ports/oauth-provider';
import type { OauthStateStore } from '../ports/oauth-state-store';
import type { SignupGateway } from '../ports/signup-gateway';
import type { SignupSettings } from '../ports/signup-settings';

// AUTH-24: a provider sign-in must come back with the state it started with, within this window.
export const OAUTH_STATE_TTL_MS = 10 * MINUTE_MS;

/** Google and Facebook sign-in, and adding them to an account (AUTH-24, AUTH-26, AUTH-27). Only enabled providers are offered. */
@Injectable()
export class OauthService {
  constructor(
    @Inject(OAUTH_PROVIDERS) private readonly providers: OauthProviderPort[],
    @Inject(OAUTH_STATE_STORE) private readonly states: OauthStateStore,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SIGNUP_SETTINGS) private readonly settings: SignupSettings,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(ENV) private readonly env: Pick<Env, 'OAUTH_CALLBACK_BASE'>,
    @Inject(SignInAudit) private readonly signInAudit: SignInAudit,
  ) {}

  enabledProviders(): OauthProvider[] {
    return this.providers.map((p) => p.provider);
  }

  async start(name: string, attachToSubscriberId: string | null = null): Promise<{ url: string }> {
    const provider = this.find(name);
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    await this.states.insert({
      state,
      provider: provider.provider,
      codeVerifier,
      expiresAt: new Date(this.settings.now().getTime() + OAUTH_STATE_TTL_MS),
      attachToSubscriberId,
    });
    return {
      url: provider.authorizeUrl({
        state,
        codeChallenge,
        redirectUri: this.redirectUri(provider.provider),
      }),
    };
  }

  async callback(
    name: string,
    code: string,
    state: string,
    context: SessionContext,
  ): Promise<OauthSignedIn | OauthAttached> {
    const provider = this.find(name);
    const attempt = await this.states.consume(state, provider.provider, this.settings.now());
    if (attempt === null) {
      throw new ApiError('validation_error', 'This sign-in link is not valid. Start again.', {
        field: 'state',
      });
    }
    const profile = await provider.exchange({
      code,
      codeVerifier: attempt.codeVerifier,
      redirectUri: this.redirectUri(provider.provider),
    });
    const kind =
      provider.provider === OauthProvider.Google ? IdentityKind.Google : IdentityKind.Facebook;

    if (attempt.attachToSubscriberId !== null) {
      return this.attach(attempt.attachToSubscriberId, kind, profile.accountId);
    }

    try {
      const result = await this.gateway.run(async (tx): Promise<OauthSignedIn> => {
        const existing = await this.gateway.findSubscriberByIdentity(tx, kind, profile.accountId);
        const subscriberId =
          existing?.subscriberId ?? (await this.createAccount(tx, kind, profile.accountId));
        const opened = await this.signedIn.open(tx, {
          subscriberId,
          signInMethod: SignInMethod.Oauth,
          mustSetPassword: false,
          context,
        });
        const recovery =
          existing === null && kind === IdentityKind.Facebook && profile.email === null
            ? 'facebook-only'
            : null;
        return { ...opened, recovery };
      });
      await this.signInAudit.log(result.tenantId, null, AuditAction.SignIn, AuditResult.Success);
      return result;
    } catch (error) {
      if (error instanceof UniqueViolation) throw new ApiError('conflict', 'Please try again.', {});
      throw error;
    }
  }

  /** Adds a provider account to a signed-in subscriber. An account already held by someone else is refused (AUTH-08). */
  private async attach(
    subscriberId: string,
    kind: IdentityKind,
    accountId: string,
  ): Promise<OauthAttached> {
    try {
      await this.gateway.run(async (tx) => {
        const holder = await this.gateway.findSubscriberByIdentity(tx, kind, accountId);
        if (holder !== null) {
          throw new ApiError('conflict', 'This account cannot be added. Try another.', {});
        }
        await this.gateway.insertIdentity(tx, {
          subscriberId,
          kind,
          value: accountId,
          verifiedAt: new Date(),
        });
      });
    } catch (error) {
      if (error instanceof UniqueViolation) {
        throw new ApiError('conflict', 'This account cannot be added. Try another.', {});
      }
      throw error;
    }
    return { attached: kind };
  }

  private async createAccount(
    tx: Transaction,
    kind: IdentityKind,
    accountId: string,
  ): Promise<string> {
    const subscriberId = await this.gateway.insertSubscriber(tx);
    await this.gateway.insertIdentity(tx, {
      subscriberId,
      kind,
      value: accountId,
      verifiedAt: new Date(),
    });
    return subscriberId;
  }

  private find(name: string): OauthProviderPort {
    const parsed = z.nativeEnum(OauthProvider).safeParse(name);
    const provider = parsed.success
      ? this.providers.find((p) => p.provider === parsed.data)
      : undefined;
    if (!provider) throw new NotFoundException('Page not found.');
    return provider;
  }

  private redirectUri(provider: OauthProvider): string {
    return `${this.env.OAUTH_CALLBACK_BASE}/auth/oauth/${provider}/callback`;
  }
}
