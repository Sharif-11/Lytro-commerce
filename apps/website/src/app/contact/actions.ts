'use server';

import {
  ContactSubmission,
  ContactValidator,
  WebhookContactDelivery,
  type ContactResult,
} from '@/lib/contact/contact-submission';
import { SiteEnvironment } from '@/lib/env';

export type ContactFormState = ContactResult | { status: 'idle' };

/** The contact form's server action. Next requires an exported async function here; the work is done by
    ContactSubmission so the rules are testable without a request. */
export async function sendContactMessage(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const env = SiteEnvironment.current();
  const delivery = env.contactWebhookUrl ? new WebhookContactDelivery(env.contactWebhookUrl) : null;
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  return new ContactSubmission(new ContactValidator(), delivery).submit({
    topic: field('topic'),
    name: field('name'),
    phone: field('phone'),
    pageLink: field('pageLink'),
    message: field('message'),
  });
}
