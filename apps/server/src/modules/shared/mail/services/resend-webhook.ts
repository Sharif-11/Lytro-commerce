import { Inject, Injectable, Logger } from '@nestjs/common';
import { MailSuppressionReason } from '@lytronix/validators';
import { ApiError } from '../../../../common/api-error';
import type { Env } from '../../../../config/env';
import { ENV } from '../../../../config/tokens';
import type { MailStore } from '../ports/mail-store';
import { MAIL_CLOCK, MAIL_STORE } from '../tokens';
import { verifySvixSignature, type SvixHeaders } from './svix-signature';

/** What Lytro did with one of Resend's webhooks. */
export type ResendWebhookOutcome = 'suppressed' | 'ignored';

interface ResendEvent {
  type?: unknown;
  data?: {
    to?: unknown;
    bounce?: { type?: unknown; subType?: unknown; message?: unknown };
  };
}

const DETAIL_MAX = 500;

/**
 * NTF-06 (Phase 7 Slice 7.3, read agreed 2026-11-07): Resend's word that an email bounced for good, or that its reader
 * marked it as spam. Only a signed message is believed. Either stops Lytro emailing the address -- every email but a
 * code its owner asks for -- until a code proves the address again or the owner's email changes. A bounce Resend calls
 * temporary changes nothing, and Resend's other events are answered and dropped. Safe to receive twice: Resend retries
 * with the same message, and stopping an address twice is stopping it once.
 */
@Injectable()
export class ResendWebhook {
  private readonly logger = new Logger('ResendWebhook');

  constructor(
    @Inject(ENV) private readonly env: Pick<Env, 'RESEND_WEBHOOK_SECRET'>,
    @Inject(MAIL_STORE) private readonly store: MailStore,
    @Inject(MAIL_CLOCK) private readonly clock: () => Date,
  ) {}

  async receive(rawBody: Buffer, headers: SvixHeaders): Promise<ResendWebhookOutcome> {
    const secret = this.env.RESEND_WEBHOOK_SECRET;
    if (!secret || !verifySvixSignature(secret, headers, rawBody, this.clock())) {
      this.logger.warn('an email webhook failed verification');
      throw new ApiError('unauthenticated', 'EmailWebhookNotVerified', {});
    }
    const event = this.parse(rawBody);
    const reason = this.reasonOf(event);
    if (reason === null) return 'ignored';
    const addresses = this.addressesOf(event);
    const detail = this.detailOf(event);
    for (const email of addresses) {
      await this.store.suppress({ email, reason, detail });
    }
    return addresses.length > 0 ? 'suppressed' : 'ignored';
  }

  private parse(rawBody: Buffer): ResendEvent | null {
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  /** A bounce for good, or a spam complaint; anything else isn't a reason to stop. */
  private reasonOf(event: ResendEvent | null): MailSuppressionReason | null {
    if (event?.type === 'email.complained') return MailSuppressionReason.Complained;
    if (event?.type === 'email.bounced' && event.data?.bounce?.type === 'Permanent') {
      return MailSuppressionReason.Bounced;
    }
    return null;
  }

  private addressesOf(event: ResendEvent | null): string[] {
    const to = event?.data?.to;
    const list = Array.isArray(to) ? to : typeof to === 'string' ? [to] : [];
    return list
      .filter((entry): entry is string => typeof entry === 'string' && entry.includes('@'))
      .map((entry) => this.bareAddress(entry));
  }

  /** "Name <a@b>" or "a@b", lowercased, as every address is kept. */
  private bareAddress(entry: string): string {
    const match = /<([^>]+)>/.exec(entry);
    return (match?.[1] ?? entry).trim().toLowerCase();
  }

  private detailOf(event: ResendEvent | null): string | null {
    const bounce = event?.data?.bounce;
    const parts = [bounce?.subType, bounce?.message].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    return parts.length > 0 ? parts.join(': ').slice(0, DETAIL_MAX) : null;
  }
}
