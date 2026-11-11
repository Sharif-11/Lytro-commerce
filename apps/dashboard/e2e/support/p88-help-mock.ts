import type { HelpLineView } from '@lytronix/validators';

// Slice 8.8 (Part 39): Lytro's help line, as the prototype's `p88-help` draws it, and the server faults its `p88-err-*`
// screens show with their error ID.

/** The drawn help line: WhatsApp and a phone, every day from 9 am to 10 pm. */
export const DRAWN_HELP_LINE: HelpLineView = {
  whatsapp: '01712345678',
  phone: '01712345678',
  opensHour: 9,
  closesHour: 22,
};

/** The prototype's error ID (API-27's K7MQ-4XR2). */
export const DRAWN_REQUEST_ID = 'K7MQ-4XR2';

/** A request the mocked server answers with a fault: a 500 or 503 with its ID, or a 4xx refusal with none. */
export interface Fault {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: RegExp;
  status: number;
  code: string;
  message: string;
  /** The response's X-Request-Id; the server sends one with every answer, the dashboard shows it on a fault alone. */
  requestId?: string;
}

/** A server fault, worded in the person's language as the server words it ("Something went wrong. Please try again."). */
export function serverFault(
  method: Fault['method'],
  path: RegExp,
  language: 'bn' | 'en',
  status = 500,
): Fault {
  return {
    method,
    path,
    status,
    code: status === 503 ? 'service_unavailable' : 'internal_error',
    message:
      status === 503
        ? language === 'bn'
          ? 'এই মুহূর্তে ছবির স্টোরেজে পৌঁছানো যাচ্ছে না। এক মিনিট পরে আবার ট্রাই করুন।'
          : 'Photo storage is not reachable right now. Please try again in a minute.'
        : language === 'bn'
          ? 'কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার ট্রাই করুন।'
          : 'Something went wrong. Please try again.',
    requestId: DRAWN_REQUEST_ID,
  };
}

/** The fault set for this request, if any. */
export function faultFor(
  faults: readonly Fault[],
  method: string,
  path: string,
): Fault | undefined {
  return faults.find((each) => each.method === method && each.path.test(path));
}

/** The moment the drawings are made at: a Tuesday at noon in Dhaka, inside the drawn hours. */
export const NOON_IN_DHAKA = new Date('2026-11-10T12:00:00+06:00');
/** Late at night in Dhaka, past the drawn closing hour (`p88-help-closed`). */
export const NIGHT_IN_DHAKA = new Date('2026-11-10T23:30:00+06:00');
