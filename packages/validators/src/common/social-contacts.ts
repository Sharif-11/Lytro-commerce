import { z } from 'zod';
import { bdMobileNumber } from './phone';

/**
 * TEN-30, SFT-21 (UI/UX batch 2, 2.1/2.2): where a shopper reaches the shop for a chat -- its WhatsApp number, its
 * Messenger username and its Facebook page. Each is optional and kept in one normal form, so the storefront builds its
 * links one way.
 */
export const MESSENGER_USERNAME_MAX_LENGTH = 100;
export const FACEBOOK_PAGE_MAX_LENGTH = 300;

// A Facebook username or page id: letters, digits and dots (older page names also carry hyphens or underscores).
const MESSENGER_USERNAME = /^[A-Za-z0-9._-]+$/;
const FACEBOOK_HOSTS = new Set(['facebook.com', 'fb.com']);
// www., m., web. or mbasic. before a Facebook or Messenger host only: m.me's own "m." is the host, not a subdomain.
const FACEBOOK_SUBDOMAINS = /^(?:www|m|web|mbasic)\.(?=(?:facebook|fb|messenger)\.com(?![\w.-]))/i;

/** The input with any scheme, a leading www/m and the query or hash taken off. */
function bareLink(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(FACEBOOK_SUBDOMAINS, '')
    .replace(/[?#].*$/, '');
}

/**
 * The Messenger username in what a seller typed: the username itself (with or without an @), or a pasted m.me,
 * messenger.com/t or facebook.com link to it. Null when it is none of these.
 */
export function messengerUsernameOf(input: string): string | null {
  const bare = bareLink(input).replace(/^@/, '');
  const lower = bare.toLowerCase();
  const prefix = ['m.me/', 'messenger.com/t/', 'facebook.com/', 'fb.com/'].find((each) =>
    lower.startsWith(each),
  );
  const name = (prefix ? bare.slice(prefix.length) : bare).replace(/\/+$/, '');
  if (name === '' || name.includes('/') || name.length > MESSENGER_USERNAME_MAX_LENGTH) return null;
  return MESSENGER_USERNAME.test(name) ? name : null;
}

/**
 * A Facebook page's link in one form, https://www.facebook.com/<page>, from whatever a seller pasted: with or without
 * https, www or m., on facebook.com or fb.com. A profile.php link keeps its id. Null for anything else.
 */
export function facebookPageUrlOf(input: string): string | null {
  const typed = input.trim();
  if (typed === '') return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(FACEBOOK_SUBDOMAINS, '');
  if (!FACEBOOK_HOSTS.has(host)) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') return null;
  if (path.toLowerCase() === '/profile.php') {
    const id = url.searchParams.get('id');
    return id && /^\d+$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null;
  }
  const page = `https://www.facebook.com${path}`;
  return page.length > FACEBOOK_PAGE_MAX_LENGTH ? null : page;
}

/** The WhatsApp chat link for a shop's WhatsApp number (kept as 01XXXXXXXXX). */
export function whatsAppChatLinkOf(number: string): string {
  const local = bdMobileNumber(number) ?? number.replace(/\D/g, '');
  return `https://wa.me/88${local}`;
}

/** The Messenger chat link for a shop's Messenger username. */
export function messengerChatLinkOf(username: string): string {
  return `https://m.me/${username}`;
}

/** An empty box clears the field, as null does. */
const emptyIsNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** A Bangladeshi mobile number for WhatsApp, kept in its local form (01XXXXXXXXX). */
export const whatsAppNumberField = z.preprocess(
  emptyIsNull,
  z
    .string()
    .max(30)
    .refine((value) => bdMobileNumber(value) !== null, {
      message: 'A Bangladeshi mobile number, such as 01711234567.',
    })
    .transform((value) => bdMobileNumber(value) ?? value)
    .nullable(),
);

/** A Messenger username, or a pasted link to one, kept as the username. */
export const messengerUsernameField = z.preprocess(
  emptyIsNull,
  z
    .string()
    .max(FACEBOOK_PAGE_MAX_LENGTH)
    .refine((value) => messengerUsernameOf(value) !== null, {
      message: 'A Messenger username, or an m.me link.',
    })
    .transform((value) => messengerUsernameOf(value) ?? value)
    .nullable(),
);

/** A Facebook page's link, kept as https://www.facebook.com/<page>. */
export const facebookPageField = z.preprocess(
  emptyIsNull,
  z
    .string()
    .max(FACEBOOK_PAGE_MAX_LENGTH)
    .refine((value) => facebookPageUrlOf(value) !== null, {
      message: 'A facebook.com page link.',
    })
    .transform((value) => facebookPageUrlOf(value) ?? value)
    .nullable(),
);
