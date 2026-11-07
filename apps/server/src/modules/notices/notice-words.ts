import type { SelectNotice } from '@lytronix/db';
import {
  NoticeCategory,
  noticePlainText,
  NoticeSeverity,
  NoticeTemplate,
  RATE_NAMES,
  rateValueWords,
  type Language,
  type RateKey,
} from '@lytronix/validators';
import type { Bilingual, MailWords } from '../../common/i18n/bilingual';
import { dhakaDay, dhakaTime } from '../../common/i18n/dates';
import type { NotificationText } from '../notifications/notification-words';

type NoticeLanguages = Pick<SelectNotice, 'titleBn' | 'titleEn' | 'bodyBn' | 'bodyEn'>;

/** A notice's title and body in one language, and which language that is. */
export interface NoticeWords {
  title: string;
  body: string;
  language: Language;
}

/**
 * NTC-15: a notice in the reader's language, or in the other when it has none in theirs -- a notice always has one
 * language whole (control.notices' own check).
 */
export function noticeIn(notice: NoticeLanguages, language: Language): NoticeWords {
  const bn =
    notice.titleBn && notice.bodyBn ? { title: notice.titleBn, body: notice.bodyBn } : null;
  const en =
    notice.titleEn && notice.bodyEn ? { title: notice.titleEn, body: notice.bodyEn } : null;
  if (language === 'en' && en) return { ...en, language: 'en' };
  if (bn) return { ...bn, language: 'bn' };
  if (en) return { ...en, language: 'en' };
  throw new Error('A notice with neither language whole.');
}

/** The most of a notice's body a bell row or a push carries: a push holds about 4 KB, and the board has the rest. */
const EXCERPT_MAX = 160;

function excerpt(body: string): string {
  const plain = noticePlainText(body).replace(/\s+/g, ' ').trim();
  return plain.length <= EXCERPT_MAX ? plain : `${plain.slice(0, EXCERPT_MAX - 1).trimEnd()}…`;
}

const FROM_LYTRO: Bilingual<string> = { bn: 'Lytro থেকে', en: 'From Lytro' };

/** NTC-06: the bell row and push for a notice -- "From Lytro: <title>" and the start of its body, in each language. */
export function noticeBellText(notice: NoticeLanguages): NotificationText {
  const bn = noticeIn(notice, 'bn');
  const en = noticeIn(notice, 'en');
  return {
    bn: { title: `${FROM_LYTRO.bn}: ${bn.title}`, body: excerpt(bn.body) },
    en: { title: `${FROM_LYTRO.en}: ${en.title}`, body: excerpt(en.body) },
  };
}

/** NTC-06, D7-56: an important or urgent notice's email to the owner, whole, as plain text. */
export function noticeMailWords(
  notice: NoticeLanguages & Pick<SelectNotice, 'requiresAck'>,
): MailWords {
  const bn = noticeIn(notice, 'bn');
  const en = noticeIn(notice, 'en');
  return {
    bn: {
      subject: `Lytro থেকে নোটিশ: ${bn.title}`,
      body: [
        noticePlainText(bn.body),
        notice.requiresAck
          ? 'ড্যাশবোর্ডের নোটিশ পেজে এটি পড়ে "বুঝেছি" চাপুন।'
          : 'ড্যাশবোর্ডের নোটিশ পেজেও এটি আছে।',
      ].join('\n\n'),
    },
    en: {
      subject: `Notice from Lytro: ${en.title}`,
      body: [
        noticePlainText(en.body),
        notice.requiresAck
          ? 'Please read it on the Notices page in your dashboard and press "I understand".'
          : 'It is also on the Notices page in your dashboard.',
      ].join('\n\n'),
    },
  };
}

/** NTC-12: what a template fills in -- the operator edits it, chooses the audience and times, and saves. */
export interface NoticeDraft {
  titleBn: string;
  titleEn: string;
  bodyBn: string;
  bodyEn: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  requiresAck: boolean;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  rateChangeId: number | null;
}

/** The figures a template writes in, each already in words where the server knows them. */
export interface NoticeTemplateFacts {
  date: Date | null;
  /** NTC-12, NTC-13: the rate, from the change itself when the template was given one, or as the operator typed it. */
  rate: { key: RateKey | null; oldValue: string | null; newValue: string | null };
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  rateChangeId: number | null;
}

/** "5 Dec, 2 am" / "5 ডিসেম্বর রাত 2টা". */
function when(date: Date, language: Language): string {
  return language === 'bn'
    ? `${dhakaDay(date, 'bn')} ${dhakaTime(date, 'bn')}`
    : `${dhakaDay(date, 'en')}, ${dhakaTime(date, 'en')}`;
}

/** Where a template leaves a gap for the operator to fill. */
const GAP = '…';

function rateChange(facts: NoticeTemplateFacts): NoticeDraft {
  const { key, oldValue, newValue } = facts.rate;
  const name: Bilingual<string> = key ? RATE_NAMES[key] : { bn: GAP, en: GAP };
  const figure = (value: string): string => (key ? rateValueWords(key, value) : value);
  const oldRate = oldValue === null ? null : figure(oldValue);
  const newRate = newValue === null ? GAP : figure(newValue);
  const day: Bilingual<string> = facts.date
    ? { bn: dhakaDay(facts.date, 'bn'), en: dhakaDay(facts.date, 'en') }
    : { bn: GAP, en: GAP };
  return {
    titleBn: oldRate
      ? `${name.bn} রেট ${day.bn} থেকে ${oldRate} → ${newRate}`
      : `${name.bn} রেট ${day.bn} থেকে ${newRate}`,
    titleEn: oldRate
      ? `${name.en} rate ${oldRate} → ${newRate} from ${day.en}`
      : `${name.en} rate ${newRate} from ${day.en}`,
    bodyBn: oldRate
      ? `${day.bn} থেকে **${name.bn}** রেট ${oldRate} থেকে বদলে **${newRate}** হচ্ছে। এরপরের প্রতিটি চার্জে নতুন রেট লাগবে; আগের চার্জ বদলাবে না।`
      : `${day.bn} থেকে **${name.bn}** রেট **${newRate}**। এরপরের প্রতিটি চার্জে এই রেট লাগবে।`,
    bodyEn: oldRate
      ? `From ${day.en}, the **${name.en}** rate changes from ${oldRate} to **${newRate}**. Every charge after that uses the new rate; earlier charges don't change.`
      : `From ${day.en}, the **${name.en}** rate is **${newRate}**. Every charge after that uses it.`,
    category: NoticeCategory.RateChange,
    severity: NoticeSeverity.Important,
    requiresAck: false,
    windowStartsAt: null,
    windowEndsAt: null,
    rateChangeId: facts.rateChangeId,
  };
}

function maintenance(facts: NoticeTemplateFacts): NoticeDraft {
  const start = facts.windowStartsAt;
  const end = facts.windowEndsAt;
  const from: Bilingual<string> = start
    ? { bn: when(start, 'bn'), en: when(start, 'en') }
    : { bn: GAP, en: GAP };
  const to: Bilingual<string> = end
    ? start && dhakaDay(start, 'en') === dhakaDay(end, 'en')
      ? { bn: dhakaTime(end, 'bn'), en: dhakaTime(end, 'en') }
      : { bn: when(end, 'bn'), en: when(end, 'en') }
    : { bn: GAP, en: GAP };
  return {
    titleBn: `${from.bn} থেকে ${to.bn} মেইনটেন্যান্স`,
    titleEn: `Maintenance ${from.en} to ${to.en}`,
    bodyBn: `${from.bn} থেকে ${to.bn} পর্যন্ত Lytro-তে মেইনটেন্যান্স চলবে। এই সময়ে ড্যাশবোর্ড আর স্টোরফ্রন্ট মাঝে মাঝে বন্ধ থাকতে পারে।`,
    bodyEn: `Lytro is under maintenance from ${from.en} to ${to.en}. The dashboard and storefronts may be unavailable at times during it.`,
    category: NoticeCategory.Maintenance,
    severity: NoticeSeverity.Important,
    requiresAck: false,
    windowStartsAt: start,
    windowEndsAt: end,
    rateChangeId: null,
  };
}

function outage(facts: NoticeTemplateFacts): NoticeDraft {
  const since = facts.date;
  return {
    titleBn: 'Lytro-তে সমস্যা চলছে',
    titleEn: 'Lytro is having problems',
    bodyBn: since
      ? `${when(since, 'bn')} থেকে Lytro-এর কিছু অংশ ঠিকমতো কাজ করছে না। আমরা ঠিক করছি; ঠিক হলে এখানে জানাব।`
      : 'Lytro-এর কিছু অংশ ঠিকমতো কাজ করছে না। আমরা ঠিক করছি; ঠিক হলে এখানে জানাব।',
    bodyEn: since
      ? `Since ${when(since, 'en')}, part of Lytro isn't working properly. We're fixing it and will post here when it's done.`
      : "Part of Lytro isn't working properly. We're fixing it and will post here when it's done.",
    category: NoticeCategory.Maintenance,
    severity: NoticeSeverity.Urgent,
    requiresAck: false,
    windowStartsAt: null,
    windowEndsAt: null,
    rateChangeId: null,
  };
}

function policyUpdate(facts: NoticeTemplateFacts): NoticeDraft {
  const day: Bilingual<string> = facts.date
    ? { bn: dhakaDay(facts.date, 'bn'), en: dhakaDay(facts.date, 'en') }
    : { bn: GAP, en: GAP };
  return {
    titleBn: `${day.bn} থেকে Lytro-এর পলিসি আপডেট`,
    titleEn: `Lytro's policy updates from ${day.en}`,
    bodyBn: `${day.bn} থেকে Lytro-এর পলিসি বদলাচ্ছে। যা বদলাচ্ছে:\n\n- ${GAP}\n\nপড়ে নিচে "বুঝেছি" চাপুন।`,
    bodyEn: `Lytro's policy changes from ${day.en}. What changes:\n\n- ${GAP}\n\nPlease read it and press "I understand" below.`,
    category: NoticeCategory.Policy,
    severity: NoticeSeverity.Important,
    requiresAck: true,
    windowStartsAt: null,
    windowEndsAt: null,
    rateChangeId: null,
  };
}

/** NTC-12: each template, written once. */
export const NOTICE_TEMPLATES: Readonly<
  Record<NoticeTemplate, (facts: NoticeTemplateFacts) => NoticeDraft>
> = {
  [NoticeTemplate.RateChange]: rateChange,
  [NoticeTemplate.Maintenance]: maintenance,
  [NoticeTemplate.Outage]: outage,
  [NoticeTemplate.PolicyUpdate]: policyUpdate,
};
