import { Inject, Injectable } from '@nestjs/common';
import { SignupConflict } from '@lytronix/db';
import { ApiError } from '../common/api-error';
import { SlugService } from '../tenancy/slug.service';
import { CLOCK, OTP_SECRET, SHOP_URL, SIGNUP_STORE } from './tokens';
import { normalizeBdPhone } from './phone';
import { codeMatches, generateCode, hashCode } from './otp';
import type { SignupStore } from './signup.store';

// AUTH-05 to AUTH-07: the limits, in one place.
export const CODE_TTL_MS = 5 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const HOURLY_CODE_CAP = 5;
export const MAX_WRONG_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface CodeIssued {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface ShopCreated {
  tenantId: string;
  address: string;
  shopUrl: string;
}

export interface CreateShopInput {
  phone: string;
  code: string;
  ownerName: string;
  shopName: string;
  address?: string | undefined;
}

/**
 * Sign-up by phone (AUTH-01, AUTH-04 to AUTH-10). Every rule that limits a code lives here, so the server
 * enforces it whatever the form does. Time comes from the injected clock, so the limits can be tested exactly.
 */
@Injectable()
export class SignupService {
  constructor(
    @Inject(SIGNUP_STORE) private readonly store: SignupStore,
    @Inject(CLOCK) private readonly clock: () => Date,
    @Inject(OTP_SECRET) private readonly secret: string,
    @Inject(SHOP_URL) private readonly shopUrl: (address: string) => string,
    @Inject(SlugService) private readonly slugs: SlugService,
  ) {}

  async requestCode(rawPhone: string): Promise<CodeIssued> {
    const phone = this.requirePhone(rawPhone);
    const now = this.clock();

    const latest = await this.store.latestChallenge(phone);
    // A lock belongs to the number, not to one code: asking for a new code must not reset it (AUTH-06).
    if (latest?.lockedUntil && latest.lockedUntil > now) {
      throw new ApiError(
        'rate_limited',
        'Too many wrong codes. Wait before trying again.',
        {},
        Math.ceil((latest.lockedUntil.getTime() - now.getTime()) / 1000),
      );
    }
    if (latest && now.getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const wait = latest.createdAt.getTime() + RESEND_COOLDOWN_MS - now.getTime();
      throw new ApiError(
        'rate_limited',
        'A code was sent a moment ago. Wait before asking for another.',
        {},
        Math.ceil(wait / 1000),
      );
    }

    const sent = await this.store.countChallengesSince(phone, new Date(now.getTime() - HOUR_MS));
    if (sent >= HOURLY_CODE_CAP) {
      throw new ApiError(
        'rate_limited',
        'Too many codes were requested for this number. Try again later.',
        {},
        HOUR_MS / 1000,
      );
    }

    const code = generateCode();
    await this.store.createChallenge({
      phone,
      codeHash: hashCode(code, phone, this.secret),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });
    await this.store.sendSms({
      toPhone: phone,
      kind: 'otp',
      body: `Your verification code is ${code}. It expires in 5 minutes. Do not share it.`,
    });

    return { expiresInSeconds: CODE_TTL_MS / 1000, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
  }

  async createShop(input: CreateShopInput): Promise<ShopCreated> {
    const phone = this.requirePhone(input.phone);
    const shopName = this.requireName(input.shopName, 'shopName', 'Enter your shop name.');
    const ownerName = this.requireName(input.ownerName, 'ownerName', 'Enter your name.');

    const challengeId = await this.verifyCode(phone, input.code);

    const address = await this.chooseAddress(shopName, input.address);
    try {
      const created = await this.store.createShop({
        challengeId,
        phone,
        ownerName,
        shopName,
        slug: address,
        liveUrl: this.shopUrl(address),
        shopReadyBody: (url) => `Your shop is ready: ${url}`,
        now: this.clock(),
      });
      return { tenantId: created.tenantId, address, shopUrl: this.shopUrl(address) };
    } catch (error) {
      if (error instanceof SignupConflict) throw await this.toApiError(error, shopName);
      throw error;
    }
  }

  /** Checks the code against the latest challenge, counting wrong attempts and applying the lock (AUTH-06). Returns the challenge. */
  private async verifyCode(phone: string, code: string): Promise<string> {
    const now = this.clock();
    const challenge = await this.store.latestChallenge(phone);
    if (!challenge || challenge.consumedAt) {
      throw new ApiError('validation_error', 'This code is not valid. Request a new one.', {
        field: 'code',
      });
    }
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      throw new ApiError(
        'rate_limited',
        'Too many wrong codes. Wait before trying again.',
        {},
        Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000),
      );
    }
    if (challenge.expiresAt <= now) {
      throw new ApiError('validation_error', 'This code has expired. Request a new one.', {
        field: 'code',
      });
    }
    if (!codeMatches(code, phone, this.secret, challenge.codeHash)) {
      const attempts = await this.store.recordWrongAttempt(challenge.id);
      if (attempts >= MAX_WRONG_ATTEMPTS) {
        await this.store.lockChallenge(challenge.id, new Date(now.getTime() + LOCK_MS));
        throw new ApiError(
          'rate_limited',
          'Too many wrong codes. Wait before trying again.',
          {},
          LOCK_MS / 1000,
        );
      }
      throw new ApiError('validation_error', 'The code is not correct.', {
        field: 'code',
        attemptsLeft: MAX_WRONG_ATTEMPTS - attempts,
      });
    }
    return challenge.id;
  }

  /** Uses the typed address, or the suggestion from the shop name. The address is shown to the owner before this step. */
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

  private async toApiError(error: SignupConflict, shopName: string): Promise<ApiError> {
    switch (error.reason) {
      case 'challenge_used':
        return new ApiError('validation_error', 'This code has already been used.', {
          field: 'code',
        });
      case 'phone_registered':
        // Deliberately vague: the reply must not confirm which numbers already have accounts (test plan risk).
        return new ApiError('conflict', 'Sign in to continue.', {});
      case 'address_taken':
        return new ApiError('conflict', 'That address is taken.', {
          field: 'address',
          suggestion: await this.slugs.suggest(shopName),
        });
    }
  }

  private requirePhone(raw: string): string {
    const phone = normalizeBdPhone(raw);
    if (!phone) {
      throw new ApiError(
        'validation_error',
        'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.',
        { field: 'phone' },
      );
    }
    return phone;
  }

  private requireName(raw: string, field: string, message: string): string {
    const value = raw.trim();
    if (value.length === 0 || value.length > 60) {
      throw new ApiError('validation_error', message, { field });
    }
    return value;
  }
}
