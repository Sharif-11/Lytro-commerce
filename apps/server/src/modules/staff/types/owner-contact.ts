import type { Language } from '@lytronix/validators';
import type { MailReader } from '../../shared/mail/services/mail.service';

/** The shop owner's own contact, for a platform-sent notice (never a staff member's), and the name an
 * invoice is made out to (BIL-12). */
export interface OwnerContact {
  phone: string | null;
  email: string | null;
  name: string | null;
  /** I18N-01 (Slice 7.3's read): the language the owner chose, which their email is written in; null until chosen. */
  language: Language | null;
}

/** NTF-06: the owner as an email's reader, when they have an address. */
export function ownerReader(contact: OwnerContact | null): MailReader | null {
  return contact?.email ? { email: contact.email, language: contact.language } : null;
}
