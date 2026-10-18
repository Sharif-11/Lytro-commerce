import { NAME_MAX_LENGTH } from '@lytronix/validators/common';

// The contact form's rules and delivery (docs/SITE-PAGES-DESIGN.md §2). Validation runs on the server; the
// browser only mirrors it for inline hints. Delivery posts to a webhook that files a ticket; without one
// the form is honest and says to use WhatsApp instead of pretending to send.

export const CONTACT_TOPICS = ['setup', 'demo', 'pricing', 'broken', 'partnership'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_MESSAGE_MAX_LENGTH = 2000;
export const CONTACT_PAGE_LINK_MAX_LENGTH = 300;

/** A Bangladeshi mobile number: 01[3-9] and eight more digits, with or without the +88 country code. */
export const BD_MOBILE_PATTERN = /^(?:\+?88)?01[3-9]\d{8}$/;

export interface ContactInput {
  topic: string;
  name: string;
  phone: string;
  pageLink: string;
  message: string;
}

export type ContactField = 'topic' | 'name' | 'phone' | 'pageLink' | 'message';
export type ContactProblem = 'required' | 'too_long' | 'invalid';

export interface ContactMessage {
  topic: ContactTopic;
  name: string;
  phone: string;
  pageLink: string | null;
  message: string;
}

export type ContactResult =
  | { status: 'sent' }
  | { status: 'invalid'; problems: Partial<Record<ContactField, ContactProblem>> }
  | { status: 'unavailable' }
  | { status: 'failed' };

export class ContactValidator {
  constructor(
    private readonly nameMaxLength = NAME_MAX_LENGTH,
    private readonly messageMaxLength = CONTACT_MESSAGE_MAX_LENGTH,
    private readonly pageLinkMaxLength = CONTACT_PAGE_LINK_MAX_LENGTH,
  ) {}

  normalisePhone(raw: string): string {
    return raw.replace(/[\s-]/g, '');
  }

  /** Either a clean message or the first problem per field. */
  validate(
    input: ContactInput,
  ): { message: ContactMessage } | { problems: Partial<Record<ContactField, ContactProblem>> } {
    const problems: Partial<Record<ContactField, ContactProblem>> = {};
    const topic = CONTACT_TOPICS.find((item) => item === input.topic);
    if (!topic) problems.topic = 'required';

    const name = input.name.trim();
    if (name.length === 0) problems.name = 'required';
    else if (name.length > this.nameMaxLength) problems.name = 'too_long';

    const phone = this.normalisePhone(input.phone);
    if (phone.length === 0) problems.phone = 'required';
    else if (!BD_MOBILE_PATTERN.test(phone)) problems.phone = 'invalid';

    const pageLink = input.pageLink.trim();
    if (pageLink.length > this.pageLinkMaxLength) problems.pageLink = 'too_long';

    const message = input.message.trim();
    if (message.length === 0) problems.message = 'required';
    else if (message.length > this.messageMaxLength) problems.message = 'too_long';

    if (Object.keys(problems).length > 0 || !topic) return { problems };
    return {
      message: { topic, name, phone, pageLink: pageLink.length > 0 ? pageLink : null, message },
    };
  }
}

export interface ContactDelivery {
  deliver(message: ContactMessage): Promise<boolean>;
}

/** POSTs the message as JSON to the configured webhook. The webhook turns it into a ticket or an email. */
export class WebhookContactDelivery implements ContactDelivery {
  constructor(
    private readonly webhookUrl: string,
    private readonly timeoutMs = 8000,
  ) {}

  async deliver(message: ContactMessage): Promise<boolean> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'lytro.app/contact',
          ...message,
          receivedAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export class ContactSubmission {
  constructor(
    private readonly validator: ContactValidator,
    private readonly delivery: ContactDelivery | null,
  ) {}

  async submit(input: ContactInput): Promise<ContactResult> {
    const checked = this.validator.validate(input);
    if ('problems' in checked) return { status: 'invalid', problems: checked.problems };
    if (!this.delivery) return { status: 'unavailable' };
    const delivered = await this.delivery.deliver(checked.message);
    return delivered ? { status: 'sent' } : { status: 'failed' };
  }
}
