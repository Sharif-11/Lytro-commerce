import { CourierKey, CourierMessagesState } from '@lytronix/validators';
import type { CourierConnection } from '@/types/couriers';
import { spanWords } from '@/views/listener/phone-health';

/**
 * A courier's own fields, named as its panel names them (Part 36's `c36Fields`): the brand's words in both languages; the email
 * and password a seller logs in to Pathao with are the dashboard's words.
 */
export const FIELD_LABEL: Readonly<Record<string, { brand: string } | { word: string }>> = {
  apiKey: { brand: 'API key' },
  secretKey: { brand: 'Secret key' },
  clientId: { brand: 'Client ID' },
  clientSecret: { brand: 'Client secret' },
  username: { word: 'crEmail' },
  password: { word: 'crPassword' },
  apiToken: { brand: 'API token' },
};

/** What each courier's connect sheet says first, and what it asks for in the list of couriers to connect. */
export const LEAD_WORD: Readonly<Record<CourierKey, string>> = {
  [CourierKey.Steadfast]: 'crSfLead',
  [CourierKey.Pathao]: 'crPtLead',
  [CourierKey.RedX]: 'crRxLead',
};
export const ASKS_WORD: Readonly<Record<CourierKey, string>> = {
  [CourierKey.Steadfast]: 'crAsksSteadfast',
  [CourierKey.Pathao]: 'crAsksPathao',
  [CourierKey.RedX]: 'crAsksRedX',
};

/**
 * The paste steps (agreed 2026-11-06: written, numbered, per courier, naming the panel's own menu words). Written from each
 * courier's guide; they wait to be checked against its live panel.
 */
export const PASTE_STEPS: Readonly<Record<CourierKey, readonly string[]>> = {
  [CourierKey.Steadfast]: ['crSf1', 'crSf2', 'crSf3', 'crSf4'],
  [CourierKey.Pathao]: ['crPt1', 'crPt2', 'crPt3', 'crPt4'],
  [CourierKey.RedX]: ['crRx1', 'crRx2', 'crRx3'],
};

/** RedX's address carries its key inside it, so only Steadfast and Pathao take the token; Pathao calls it Secret. */
export const tokenLabel = (key: CourierKey): string | null =>
  key === CourierKey.RedX ? null : key === CourierKey.Pathao ? 'crSecret' : 'crToken';

type Words = (key: string, options?: Record<string, unknown>) => string;

/**
 * Whether a connection's messages arrive (CRR-02, CRR-15, D6-3; Part 36's `c36Msg`): arriving, with when the last came, in
 * success tone; arriving without the token, or the night check finding news no message brought, in warning tone; none yet.
 */
export function messageLine(
  connection: CourierConnection,
  t: Words,
): { text: string; tone: 'ok' | 'warn' | 'plain' } {
  if (connection.messagesMissedAt !== null) return { text: t('crMsgBroken'), tone: 'warn' };
  switch (connection.messages) {
    case CourierMessagesState.TokenMissing:
      return { text: t('crMsgToken'), tone: 'warn' };
    case CourierMessagesState.Arriving:
      return {
        text: t('crMsgArriving', {
          t: connection.lastMessageAt ? spanWords(connection.lastMessageAt, t) : '',
        }),
        tone: 'ok',
      };
    case CourierMessagesState.NoneYet:
      return { text: t('crMsgNone'), tone: 'plain' };
  }
}
