import { Inject, Injectable } from '@nestjs/common';
import {
  ChallengeChannel,
  type ChallengeKind,
  ServerFieldProblemCode,
  type SmsLogKind,
  SmsLogStatus,
} from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError, FieldsError } from '../../../common/api-error';
import { HOUR_MS, MINUTE_MS } from '../../../common/time';
import { MailDeliveryError } from '../../../common/errors/mail-delivery';
import { SmsDeliveryError } from '../../../common/errors/sms-delivery';
import {
  type CodeTaken,
  EssentialSmsUsageService,
  ShopCannotPayForCode,
} from '../../sms-usage/services/essential-sms-usage.service';
import { SmsLog } from '../../sms-usage/services/sms-log';
import type { SmsSent } from '../../shared/messaging/ports/sms-provider';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { OneTimeCodeHasher } from './one-time-code-hasher';
import { CHALLENGE_STORE, CODE_SMS_PER_IP, SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
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

/** AUTH-21, SMS-04: the shop whose own use a code is, and what kind of code it is there. */
export interface CountedTo {
  tenantId: string;
  kind: SmsLogKind;
}

/** How one code is asked for. */
export interface IssueOptions {
  /** The wait before the same destination's next code (AUTH-07), or AUTH-18's for a reset. */
  cooldownMs?: number;
  countedTo?: CountedTo | null;
  /** SMS-11: the client address that asked, when the server can trust it (D14). Null is never counted. */
  ip?: string | null;
}

type Delivery =
  | { channel: ChallengeChannel.Sms; message: Awaited<ReturnType<MessagingService['queueOtp']>> }
  | { channel: ChallengeChannel.Email; message: Awaited<ReturnType<MailService['queueOtp']>> };

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
    @Inject(EssentialSmsUsageService) private readonly essentialSms: EssentialSmsUsageService,
    @Inject(SmsLog) private readonly smsLog: SmsLog,
    @Inject(CODE_SMS_PER_IP) private readonly smsPerIp: number,
  ) {}

  /**
   * `countedTo`: AUTH-21, SMS-04 to SMS-06 (Slice 7.1) -- set only when the code comes from a shop's own use: a sign-in
   * code to a shop that exists, or a staff member's reset code (never sign-up, an owner's reset, an identity-add code,
   * or a lapsed shop). Such an SMS code is free within the shop's allowance, then charged from its balance, never below
   * zero; when the balance can't pay, no code is made and the refusal says why (`ShopCannotPayForCode`, the owner's
   * call over AUTH-13's same-answer rule, 2026-11-06). Every such code is logged as sent, failed or refused.
   */
  async issue(
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
    options: IssueOptions = {},
  ): Promise<CodeIssued> {
    const cooldownMs = options.cooldownMs ?? RESEND_COOLDOWN_MS;
    const counted = channel === ChallengeChannel.Sms ? (options.countedTo ?? null) : null;
    const ip = options.ip ?? null;
    let prepared;
    try {
      prepared = await this.prepare(destination, channel, kind, cooldownMs, counted, ip);
    } catch (error) {
      if (error instanceof ShopCannotPayForCode && counted !== null) {
        await this.smsLog.record({
          tenantId: counted.tenantId,
          kind: counted.kind,
          toPhone: destination,
          units: error.units,
          cost: '0',
          isEssential: true,
          status: SmsLogStatus.Blocked,
          blockedReason: 'insufficient_balance',
        });
      }
      throw error;
    }
    const { issued, delivery, expiresAt, taken } = prepared;

    let sent: SmsSent | null = null;
    try {
      if (delivery.channel === ChallengeChannel.Sms) {
        sent = await this.messaging.deliverOtp(delivery.message);
      } else {
        await this.mail.deliverOtp(delivery.message);
      }
    } catch (error) {
      if (error instanceof SmsDeliveryError && delivery.channel === ChallengeChannel.Sms) {
        if (taken !== null && counted !== null) await this.giveBack(taken, counted, destination);
        // D27: the code is still valid for a few minutes, so a bounded background retry gets a second chance at
        // delivering it. Best-effort: a failure to queue it never hides the error the caller is about to see.
        await this.queueRetry(delivery.message, expiresAt);
      }
      if (error instanceof SmsDeliveryError || error instanceof MailDeliveryError) {
        // The code was not delivered. The cooldown equals this retry hint, so asking again is possible when it ends.
        throw new ApiError('service_unavailable', 'CodeSendFailed', {}, cooldownMs / 1000);
      }
      throw error;
    }
    if (sent !== null && taken !== null && counted !== null) {
      await this.smsLog.record({
        tenantId: counted.tenantId,
        kind: counted.kind,
        toPhone: destination,
        units: taken.units,
        cost: taken.cost,
        isEssential: true,
        status: SmsLogStatus.Sent,
        providerMessageId: sent.providerMessageId,
      });
    }
    return issued;
  }

  /** The limits, the code, its message, and what it takes from the shop -- in one transaction, so a refusal leaves none. */
  private prepare(
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
    cooldownMs: number,
    counted: CountedTo | null,
    ip: string | null,
  ) {
    return this.gateway.run(async (tx) => {
      const now = this.settings.now();
      const latest = await this.challenges.latest(tx, destination, channel, kind);

      if (latest?.lockedUntil && latest.lockedUntil > now) {
        throw this.tooManyWrongCodes(
          Math.ceil((latest.lockedUntil.getTime() - now.getTime()) / 1000),
        );
      }
      if (latest && now.getTime() - latest.createdAt.getTime() < cooldownMs) {
        const wait = latest.createdAt.getTime() + cooldownMs - now.getTime();
        throw new ApiError('rate_limited', 'CodeSentRecently', {}, Math.ceil(wait / 1000));
      }
      const sent = await this.challenges.countSince(
        tx,
        destination,
        channel,
        kind,
        new Date(now.getTime() - HOUR_MS),
      );
      if (sent >= HOURLY_CODE_CAP) {
        throw new ApiError('rate_limited', 'TooManyCodesRequested', {}, HOUR_MS / 1000);
      }
      // SMS-11, D7-27: one address can't text codes to many phones, each of which costs Lytro or a shop money.
      if (
        channel === ChallengeChannel.Sms &&
        ip !== null &&
        (await this.challenges.countFromIpSince(
          tx,
          ip,
          channel,
          new Date(now.getTime() - HOUR_MS),
        )) >= this.smsPerIp
      ) {
        throw new ApiError('rate_limited', 'TooManyCodesRequested', {}, HOUR_MS / 1000);
      }

      const code = this.hasher.generate();
      const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
      await this.challenges.create(tx, {
        destination,
        channel,
        kind,
        codeHash: this.hasher.hash(code, destination),
        expiresAt,
        requestedIp: ip,
      });
      const delivery: Delivery =
        channel === ChallengeChannel.Sms
          ? { channel, message: await this.messaging.queueOtp(tx, destination, code, kind) }
          : { channel, message: await this.mail.queueOtp(tx, destination, code, kind) };
      const taken: CodeTaken | null =
        delivery.channel === ChallengeChannel.Sms && counted !== null
          ? await this.essentialSms.takeForCode(
              tx,
              counted.tenantId,
              delivery.message.body,
              counted.kind,
            )
          : null;
      return {
        issued: {
          expiresInSeconds: CODE_TTL_MS / 1000,
          resendAfterSeconds: cooldownMs / 1000,
        },
        delivery,
        expiresAt,
        taken,
      };
    });
  }

  /**
   * SMS-08: a code that never went out costs the shop nothing. Best-effort, like the retry: a failure here is logged,
   * never thrown, so it can't mask the delivery error the caller sees.
   */
  private async giveBack(taken: CodeTaken, counted: CountedTo, destination: string): Promise<void> {
    try {
      await this.gateway.run((tx) => this.essentialSms.giveBack(tx, taken));
    } catch (error) {
      console.error(
        `[otp] could not give back a failed code's SMS to shop ${counted.tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.smsLog.record({
      tenantId: counted.tenantId,
      kind: counted.kind,
      toPhone: destination,
      units: taken.units,
      cost: '0',
      isEssential: true,
      status: SmsLogStatus.Failed,
    });
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
        throw new FieldsError([
          { field: 'code', problem: ServerFieldProblemCode.Expired, messageKey: 'CodeInvalid' },
        ]);
      case 'expired':
        throw new FieldsError([
          { field: 'code', problem: ServerFieldProblemCode.Expired, messageKey: 'CodeExpired' },
        ]);
      case 'locked':
        throw this.tooManyWrongCodes(outcome.retryAfterSeconds);
      case 'wrong':
        throw new FieldsError(
          [
            {
              field: 'code',
              problem: ServerFieldProblemCode.Incorrect,
              messageKey: 'CodeIncorrectTriesLeft',
              params: { attemptsLeft: outcome.attemptsLeft },
            },
          ],
          'validation_error',
          { attemptsLeft: outcome.attemptsLeft },
        );
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
    return new ApiError('rate_limited', 'TooManyWrongCodes', {}, retryAfterSeconds);
  }
}
