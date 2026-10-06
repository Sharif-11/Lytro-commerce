import { Inject, Injectable } from '@nestjs/common';
import type { ChallengeKind } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS, MINUTE_MS } from '../../../common/time';
import { SmsDeliveryError } from '../../../common/errors/sms-delivery';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { OneTimeCodeHasher } from './one-time-code-hasher';
import { CHALLENGE_STORE, SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
import type { ChallengeRecord, ChallengeStore } from '../ports/challenge-store';
import type { SignupGateway } from '../ports/signup-gateway';
import type { SignupSettings } from '../ports/signup-settings';
import type { CodeIssued } from '../types/code-issued';

// AUTH-05 to AUTH-07: the limits on one-time codes, in one place.
export const CODE_TTL_MS = 5 * MINUTE_MS;
export const RESEND_COOLDOWN_MS = MINUTE_MS;
// AUTH-18: a reset code may be requested once per two minutes per account.
export const RESET_COOLDOWN_MS = 2 * MINUTE_MS;
export const HOURLY_CODE_CAP = 5;
export const MAX_WRONG_ATTEMPTS = 5;
export const LOCK_MS = 15 * MINUTE_MS;

type CheckOutcome =
  | { kind: 'ok'; challengeId: string }
  | { kind: 'missing' }
  | { kind: 'locked'; retryAfterSeconds: number }
  | { kind: 'expired' }
  | { kind: 'wrong'; attemptsLeft: number };

/**
 * Issues and checks one-time codes. Each operation is its own unit of work. A wrong code is counted in a
 * committed transaction and only then reported as an error, so the count survives the failed request.
 */
@Injectable()
export class OneTimeCodeService {
  constructor(
    @Inject(CHALLENGE_STORE) private readonly challenges: ChallengeStore,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: Pick<SignupGateway, 'run'>,
    @Inject(SIGNUP_SETTINGS) private readonly settings: SignupSettings,
    @Inject(OneTimeCodeHasher) private readonly hasher: OneTimeCodeHasher,
    @Inject(MessagingService) private readonly messaging: MessagingService,
  ) {}

  async issue(
    phone: string,
    kind: ChallengeKind,
    cooldownMs: number = RESEND_COOLDOWN_MS,
  ): Promise<CodeIssued> {
    const { issued, message } = await this.gateway.run(async (tx) => {
      const now = this.settings.now();
      const latest = await this.challenges.latest(tx, phone, kind);

      if (latest?.lockedUntil && latest.lockedUntil > now) {
        throw this.tooManyWrongCodes(
          Math.ceil((latest.lockedUntil.getTime() - now.getTime()) / 1000),
        );
      }
      if (latest && now.getTime() - latest.createdAt.getTime() < cooldownMs) {
        const wait = latest.createdAt.getTime() + cooldownMs - now.getTime();
        throw new ApiError(
          'rate_limited',
          'A code was sent a moment ago. Wait before asking for another.',
          {},
          Math.ceil(wait / 1000),
        );
      }
      const sent = await this.challenges.countSince(
        tx,
        phone,
        kind,
        new Date(now.getTime() - HOUR_MS),
      );
      if (sent >= HOURLY_CODE_CAP) {
        throw new ApiError(
          'rate_limited',
          'Too many codes were requested for this number. Try again later.',
          {},
          HOUR_MS / 1000,
        );
      }

      const code = this.hasher.generate();
      await this.challenges.create(tx, {
        phone,
        kind,
        codeHash: this.hasher.hash(code, phone),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      });
      const queued = await this.messaging.queueOtp(tx, phone, code, kind);
      return {
        issued: {
          expiresInSeconds: CODE_TTL_MS / 1000,
          resendAfterSeconds: cooldownMs / 1000,
        },
        message: queued,
      };
    });

    try {
      await this.messaging.deliverOtp(message);
    } catch (error) {
      if (error instanceof SmsDeliveryError) {
        // The code was not delivered. The cooldown equals this retry hint, so asking again is possible when it ends.
        throw new ApiError(
          'service_unavailable',
          'We could not send your code. Try again in a minute.',
          {},
          cooldownMs / 1000,
        );
      }
      throw error;
    }
    return issued;
  }

  /** Returns the challenge the code was checked against, or throws the matching error. */
  async verify(phone: string, code: string, kind: ChallengeKind): Promise<string> {
    const outcome = await this.gateway.run((tx) => this.check(tx, phone, code, kind));
    switch (outcome.kind) {
      case 'ok':
        return outcome.challengeId;
      case 'missing':
        throw new ApiError('validation_error', 'This code is not valid. Request a new one.', {
          field: 'code',
        });
      case 'expired':
        throw new ApiError('validation_error', 'This code has expired. Request a new one.', {
          field: 'code',
        });
      case 'locked':
        throw this.tooManyWrongCodes(outcome.retryAfterSeconds);
      case 'wrong':
        throw new ApiError('validation_error', 'The code is not correct.', {
          field: 'code',
          attemptsLeft: outcome.attemptsLeft,
        });
    }
  }

  private async check(
    tx: Transaction,
    phone: string,
    code: string,
    kind: ChallengeKind,
  ): Promise<CheckOutcome> {
    const now = this.settings.now();
    const challenge: ChallengeRecord | null = await this.challenges.latest(tx, phone, kind);
    if (!challenge || challenge.consumedAt) return { kind: 'missing' };
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      return {
        kind: 'locked',
        retryAfterSeconds: Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000),
      };
    }
    if (challenge.expiresAt <= now) return { kind: 'expired' };

    if (this.hasher.matches(code, phone, challenge.codeHash)) {
      return { kind: 'ok', challengeId: challenge.id };
    }

    const attempts = await this.challenges.recordWrongAttempt(tx, challenge.id);
    if (attempts >= MAX_WRONG_ATTEMPTS) {
      await this.challenges.lock(tx, challenge.id, new Date(now.getTime() + LOCK_MS));
      return { kind: 'locked', retryAfterSeconds: LOCK_MS / 1000 };
    }
    return { kind: 'wrong', attemptsLeft: MAX_WRONG_ATTEMPTS - attempts };
  }

  private tooManyWrongCodes(retryAfterSeconds: number): ApiError {
    return new ApiError(
      'rate_limited',
      'Too many wrong codes. Wait before trying again.',
      {},
      retryAfterSeconds,
    );
  }
}
