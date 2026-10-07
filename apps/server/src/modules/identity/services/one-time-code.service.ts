import { Inject, Injectable } from '@nestjs/common';
import { ChallengeChannel, type ChallengeKind } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS, MINUTE_MS } from '../../../common/time';
import { MailDeliveryError } from '../../../common/errors/mail-delivery';
import { SmsDeliveryError } from '../../../common/errors/sms-delivery';
import { MailService } from '../../shared/mail/services/mail.service';
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

type Delivery =
  | { channel: ChallengeChannel.Sms; message: Awaited<ReturnType<MessagingService['queueOtp']>> }
  | { channel: ChallengeChannel.Email; to: string; code: string; purpose: ChallengeKind };

/** Issues and checks one-time codes by SMS or email. The same limits apply to both channels. */
@Injectable()
export class OneTimeCodeService {
  constructor(
    @Inject(CHALLENGE_STORE) private readonly challenges: ChallengeStore,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: Pick<SignupGateway, 'run'>,
    @Inject(SIGNUP_SETTINGS) private readonly settings: SignupSettings,
    @Inject(OneTimeCodeHasher) private readonly hasher: OneTimeCodeHasher,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async issue(
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
    cooldownMs: number = RESEND_COOLDOWN_MS,
  ): Promise<CodeIssued> {
    const { issued, delivery, expiresAt } = await this.gateway.run(async (tx) => {
      const now = this.settings.now();
      const latest = await this.challenges.latest(tx, destination, channel, kind);

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
        destination,
        channel,
        kind,
        new Date(now.getTime() - HOUR_MS),
      );
      if (sent >= HOURLY_CODE_CAP) {
        throw new ApiError(
          'rate_limited',
          'Too many codes were requested for this destination. Try again later.',
          {},
          HOUR_MS / 1000,
        );
      }

      const code = this.hasher.generate();
      const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
      await this.challenges.create(tx, {
        destination,
        channel,
        kind,
        codeHash: this.hasher.hash(code, destination),
        expiresAt,
      });
      const delivery: Delivery =
        channel === ChallengeChannel.Sms
          ? { channel, message: await this.messaging.queueOtp(tx, destination, code, kind) }
          : { channel, to: destination, code, purpose: kind };
      return {
        issued: {
          expiresInSeconds: CODE_TTL_MS / 1000,
          resendAfterSeconds: cooldownMs / 1000,
        },
        delivery,
        expiresAt,
      };
    });

    try {
      if (delivery.channel === ChallengeChannel.Sms) {
        await this.messaging.deliverOtp(delivery.message);
      } else {
        await this.mail.deliverCode(delivery.to, delivery.code, delivery.purpose);
      }
    } catch (error) {
      if (error instanceof SmsDeliveryError && delivery.channel === ChallengeChannel.Sms) {
        // D27: the code is still valid for a few minutes, so a bounded background retry gets a second chance at
        // delivering it. Best-effort: a failure to queue it never hides the error the caller is about to see.
        await this.queueRetry(delivery.message, expiresAt);
      }
      if (error instanceof SmsDeliveryError || error instanceof MailDeliveryError) {
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

  /** Best-effort: a failure here is logged, never thrown, so it can't mask the delivery error the caller sees. */
  private async queueRetry(
    message: Awaited<ReturnType<MessagingService['queueOtp']>>,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.gateway.run((tx) => this.messaging.queueOtpRetry(tx, message, expiresAt));
    } catch (retryError) {
      console.error(
        `[otp] could not queue a retry for message ${String(message.id)}: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`,
      );
    }
  }

  /** Returns the challenge the code was checked against, or throws the matching error. */
  async verify(
    destination: string,
    channel: ChallengeChannel,
    code: string,
    kind: ChallengeKind,
  ): Promise<string> {
    const outcome = await this.gateway.run((tx) =>
      this.check(tx, destination, channel, code, kind),
    );
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
    destination: string,
    channel: ChallengeChannel,
    code: string,
    kind: ChallengeKind,
  ): Promise<CheckOutcome> {
    const now = this.settings.now();
    const challenge: ChallengeRecord | null = await this.challenges.latest(
      tx,
      destination,
      channel,
      kind,
    );
    if (!challenge || challenge.consumedAt) return { kind: 'missing' };
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      return {
        kind: 'locked',
        retryAfterSeconds: Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000),
      };
    }
    if (challenge.expiresAt <= now) return { kind: 'expired' };

    if (this.hasher.matches(code, destination, challenge.codeHash)) {
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
