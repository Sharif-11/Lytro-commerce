import { PACK_AUTO_BUY_CAP, takaFigure, UsageMetric, type Language } from '@lytronix/validators';
import type { Bilingual } from '../../../common/i18n/bilingual';
import { dhakaDay as day } from '../../../common/i18n/dates';
import { DAY_MS } from '../../../common/time';
import type { UsageNotice } from '../../usage-warnings/types/usage-notice';
import { GB } from '../../media/services/media-bandwidth';
import { MB } from '../../media/services/media-limits';
import type { ShopUsage, Suggestion, Suggestions } from '../types/usage';
import { SERVING_METRICS } from './metric-limits';
import { runOutDate } from './pace';

/** One notice as the owner reads it: by email, and the short form an SMS carries. */
export interface NoticeText {
  subject: string;
  body: string;
  sms: string;
}

// LIM-01: what each metric is called in a notice.
const NAMES: Readonly<Record<UsageMetric, Bilingual<string>>> = {
  [UsageMetric.Products]: { bn: 'প্রোডাক্ট', en: 'products' },
  [UsageMetric.Seats]: { bn: 'স্টাফ সিট', en: 'seats' },
  [UsageMetric.Storage]: { bn: 'মিডিয়া স্টোরেজ', en: 'media storage' },
  [UsageMetric.Bandwidth]: { bn: 'মিডিয়া ব্যান্ডউইথ', en: 'media bandwidth' },
  [UsageMetric.Requests]: { bn: 'API রিকোয়েস্ট', en: 'API requests' },
  [UsageMetric.EssentialSmsMonthly]: { bn: 'এই মাসের ফ্রি SMS', en: 'free SMS this month' },
  [UsageMetric.EssentialSmsTotal]: { bn: 'ফ্রি SMS', en: 'free SMS' },
  [UsageMetric.OrdersMonthly]: { bn: 'এই পিরিয়ডের অর্ডার', en: 'orders handled this period' },
  [UsageMetric.OrdersTotal]: { bn: 'অর্ডার', en: 'orders handled' },
  [UsageMetric.OrdersDaily]: { bn: 'আজকের অর্ডার', en: 'orders handled today' },
  [UsageMetric.SmsSpend]: { bn: 'SMS খরচ', en: 'SMS spend' },
};

// What stops for shoppers when a metric that serves them is used up (BND-03, RTE-03).
const SERVED: Partial<Record<UsageMetric, Bilingual<{ what: string; stopped: string }>>> = {
  [UsageMetric.Bandwidth]: {
    bn: { what: 'ছবি আর ভিডিও এখনো দেখা যাচ্ছে', stopped: 'ছবি আর ভিডিও দেখানো বন্ধ হয়ে গেছে' },
    en: {
      what: 'images and videos are still shown',
      stopped: 'images and videos have stopped showing',
    },
  },
  [UsageMetric.Requests]: {
    bn: {
      what: 'ক্যাটালগ এখনো আপনার ওয়েবসাইট আর স্টোরফ্রন্টে উত্তর দিচ্ছে',
      stopped: 'ক্যাটালগ আপনার ওয়েবসাইট আর স্টোরফ্রন্টে উত্তর দেওয়া বন্ধ করেছে',
    },
    en: {
      what: 'catalogue still answers your website and storefront',
      stopped: 'catalogue has stopped answering your website and storefront',
    },
  },
};

/** A figure as a notice writes it: bytes in GB or MB, by the size of the limit they are read against. */
function amount(metric: UsageMetric, value: number, limit: number): string {
  if (metric !== UsageMetric.Storage && metric !== UsageMetric.Bandwidth) return String(value);
  return limit >= GB ? `${(value / GB).toFixed(1)} GB` : `${String(Math.round(value / MB))} MB`;
}

function option(suggestion: Suggestion, language: Language): string {
  if (language === 'bn') {
    if (suggestion.kind === 'contact') return 'কাস্টম প্ল্যানের জন্য Lytro-এর সাথে যোগাযোগ করুন';
    if (suggestion.kind === 'addons') {
      const items = suggestion.items
        .map((item) => {
          const name = item.nameBn ?? item.name;
          return item.quantity === 1
            ? `${name} অ্যাড-অন`
            : `${String(item.quantity)}টি ${name} অ্যাড-অন`;
        })
        .join(' আর ');
      return `মাসে ${String(suggestion.monthly)} TK-তে প্ল্যানে ${items} যোগ করুন`;
    }
    const term = suggestion.months === 1 ? 'এক মাসে' : `${String(suggestion.months)} মাসে`;
    const monthly = suggestion.months === 1 ? '' : ` (মাসে ${String(suggestion.monthly)} TK)`;
    return `${suggestion.name}, ${term} ${String(suggestion.price)} TK${monthly}`;
  }
  if (suggestion.kind === 'contact') return 'contact Lytro for a custom plan';
  if (suggestion.kind === 'addons') {
    const items = suggestion.items
      .map((item) =>
        item.quantity === 1
          ? `the ${item.name} add-on`
          : `${String(item.quantity)} ${item.name} add-ons`,
      )
      .join(' and ');
    return `add ${items} to your plan, ${String(suggestion.monthly)} TK a month`;
  }
  const term = suggestion.months === 1 ? 'a month' : `${String(suggestion.months)} months`;
  const monthly = suggestion.months === 1 ? '' : ` (${String(suggestion.monthly)} TK a month)`;
  return `${suggestion.name}, ${String(suggestion.price)} TK for ${term}${monthly}`;
}

/**
 * BND-04, RTE-11, PLN-15: what the notice at the allowance or the stop says of packs -- the one-tap pack and auto-buy,
 * or what auto-buy is doing, or why it could not.
 */
function packLine(notice: UsageNotice, usage: ShopUsage, language: Language): string {
  const pack = usage.packs.find((each) => each.metric === notice.metric);
  if (!pack) return '';
  const offer = pack.offer;
  const name = offer ? (language === 'bn' ? (offer.nameBn ?? offer.name) : offer.name) : '';
  const bn = language === 'bn';
  if (pack.autoBuy) {
    if (pack.autoBuyFailed) {
      return bn
        ? ' অটো-বাই প্যাক কিনতে পারেনি: ব্যালেন্স পর্যাপ্ত নেই। একটি কিনতে টপ-আপ করুন।'
        : ' Auto-buy could not buy a pack: your balance is too short. Top up to buy one.';
    }
    if (pack.autoPacks >= PACK_AUTO_BUY_CAP) {
      return bn
        ? ` এই সাইকেলে অটো-বাই এর মধ্যেই ${String(PACK_AUTO_BUY_CAP)}টি প্যাক কিনেছে।`
        : ` Auto-buy has already bought its ${String(PACK_AUTO_BUY_CAP)} packs this cycle.`;
    }
    if (!offer) return '';
    return bn
      ? ` অটো-বাই আপনার ব্যালেন্স থেকে ${String(offer.price)} TK দিয়ে একটি ${name} কিনছে।`
      : ` Auto-buy is buying a ${name} for ${String(offer.price)} TK from your balance.`;
  }
  if (!offer) return '';
  return bn
    ? ` ড্যাশবোর্ড থেকে এক ট্যাপে ${String(offer.price)} TK দিয়ে একটি ${name} কিনুন, অথবা অটো-বাই চালু করুন।`
    : ` Buy a ${name} for ${String(offer.price)} TK from your dashboard in one tap, or switch on auto-buy.`;
}

/** LIM-01: the cheapest fix and the alternative, in a sentence; nothing when no metric is near its limit. */
function roomLine(suggestions: Suggestions | null, language: Language): string {
  if (!suggestions) return '';
  const first = option(suggestions.first, language);
  if (language === 'bn') {
    const rest = suggestions.alternative
      ? `, অথবা ${option(suggestions.alternative, language)}`
      : '';
    return ` আরও জায়গার জন্য: ${first}${rest}।`;
  }
  const rest = suggestions.alternative ? `, or ${option(suggestions.alternative, language)}` : '';
  return ` For more room: ${first}${rest}.`;
}

/** LIM-01: when a per-cycle metric runs out at the pace of the cycle so far, or that it lasts the cycle. */
function paceLine(notice: UsageNotice, usage: ShopUsage, now: Date, language: Language): string {
  const runsOut = runOutDate(notice.used, notice.limit, usage.cycleStart, now);
  if (!runsOut) return '';
  const bn = language === 'bn';
  if (runsOut >= usage.cycleEnd) {
    return bn
      ? ` এই সাইকেলের গতিতে এটি সাইকেল শেষ হওয়ার দিন, ${day(usage.cycleEnd, language)} পর্যন্ত চলবে।`
      : ` At this cycle's pace it lasts until the cycle ends on ${day(usage.cycleEnd, language)}.`;
  }
  const days = Math.max(Math.round((runsOut.getTime() - now.getTime()) / DAY_MS), 1);
  return bn
    ? ` এই সাইকেলের গতিতে এটি প্রায় ${String(days)} দিনে, ${day(runsOut, language)}-এর কাছাকাছি, শেষ হয়ে যাবে।`
    : ` At this cycle's pace it runs out in about ${String(days)} day${days === 1 ? '' : 's'}, around ${day(runsOut, language)}.`;
}

/**
 * LIM-01, BND-05, RTE-03, RTE-12: the words of a usage notice -- how much is used, what happens to shoppers at a limit
 * that serves them, when it runs out, and what would give room (the cheapest fix and one alternative). The email is in
 * the owner's language (Slice 7.3's read; English when none is given); the SMS stays English and ASCII only, so it is
 * one plain part (KNOWN-GAPS §127).
 */
export function noticeText(
  notice: UsageNotice,
  shopName: string,
  usage: ShopUsage,
  now: Date,
  gracePercent: number,
  language: Language = 'en',
): NoticeText {
  const bn = language === 'bn';
  const names = NAMES[notice.metric];
  const name = names[language];
  const used = amount(notice.metric, notice.used, notice.limit);
  const limit = amount(notice.metric, notice.limit, notice.limit);
  const room = roomLine(usage.suggestions, language);
  const served = SERVED[notice.metric];
  const resets = day(usage.cycleEnd, language);
  if (notice.metric === UsageMetric.SmsSpend) {
    // SMS-13 (Slice 7.2): the owner's own cap, so nothing to buy and no plan to suggest; by email only (`smsDue`).
    const share = Math.round((notice.used * 100) / notice.limit);
    const spent = takaFigure(notice.used.toFixed(2));
    const cap = takaFigure(notice.limit.toFixed(2));
    return bn
      ? {
          subject: `${shopName}: আপনার SMS খরচের লিমিটের ${String(share)}% ব্যবহার হয়েছে`,
          body:
            `${shopName}-এর অর্ডার SMS-এ এই মাসে আপনার ঠিক করা ${cap} TK লিমিটের মধ্যে ${spent} TK খরচ হয়েছে। ` +
            `লিমিটে পৌঁছালে মাস শেষ হওয়া পর্যন্ত, ${resets} পর্যন্ত, এগুলো বন্ধ থাকবে; লগইন কোড আর শপ রেডির SMS তবুও ` +
            'যাবে। SMS সেটিংস থেকে লিমিট বাড়ান বা তুলে দিন।',
          sms: '',
        }
      : {
          subject: `${shopName}: ${String(share)}% of your SMS spend cap used`,
          body:
            `${shopName}'s order SMS have cost ${spent} TK of the ${cap} TK cap you set for this month. At the cap they ` +
            `stop until the month ends on ${resets}; sign-in codes and the shop-ready SMS still go out. Raise or remove ` +
            'the cap in SMS settings.',
          sms: '',
        };
  }
  if (notice.level === 'fast_spend') {
    const share = Math.round((notice.used * 100) / notice.limit);
    const sms = `Lytro: ${shopName} made ${used} API requests in one hour. Check your dashboard.`;
    return bn
      ? {
          subject: `${shopName}: এক ঘণ্টায় ${used}টি API রিকোয়েস্ট`,
          body:
            `${shopName} এক ঘণ্টায় ${used}টি API রিকোয়েস্ট করেছে, যা এর সাইকেলের ${limit}টির ${String(share)}%। কিছুই ` +
            'আটকানো হয়নি, তবে সাইকেলের লিমিট সেই হারে দ্রুত ফুরিয়ে যাচ্ছে। এটা যদি আপনার কাস্টমারদের না হয়, কেউ হয়তো ' +
            'আপনার ক্যাটালগ কপি করছে: Lytro সাপোর্টকে জানান, আমরা দেখব।',
          sms,
        }
      : {
          subject: `${shopName}: ${used} API requests in one hour`,
          body:
            `${shopName} made ${used} API requests in one hour, ${String(share)}% of the ${limit} its cycle allows. ` +
            'Nothing is refused, but the cycle is spent that much faster. If that was not your shoppers, someone may be ' +
            'copying your catalogue: tell Lytro support and we will look into it.',
          sms,
        };
  }
  const packs = served ? packLine(notice, usage, language) : '';
  if (notice.level === 'stopped' && served) {
    const stopped = served[language].stopped;
    const sms = `Lytro: ${shopName}'s ${served.en.stopped}: its ${names.en} is used up. Get more room from your dashboard.`;
    return bn
      ? {
          subject: `${shopName}: ${stopped}`,
          body:
            `${shopName} এই সাইকেলের ${name} (${limit}) আর তার পরের ${String(gracePercent)}% ব্যবহার করে ফেলেছে, তাই ` +
            `${stopped}। সাইকেল শেষ হলে, ${resets} তারিখে, অথবা আরও জায়গা পেলেই এগুলো আবার চালু হবে।${packs}${room}`,
          sms,
        }
      : {
          subject: `${shopName}: your ${stopped}`,
          body:
            `${shopName} has used its ${name} for this cycle (${limit}) and the ${String(gracePercent)}% after it, so its ` +
            `${stopped}. They come back when the cycle ends on ${resets}, or as soon as it has more room.` +
            `${packs}${room}`,
          sms,
        };
  }
  if (notice.level === 100 && served) {
    // BND-03, RTE-03: the grace is a share of the shop's own limit, so with packs it is a smaller share of the allowance.
    const stopAt =
      usage.metrics.find((figure) => figure.metric === notice.metric)?.stopAt ??
      (notice.limit * (100 + gracePercent)) / 100;
    const until = amount(notice.metric, Math.floor(stopAt), notice.limit);
    const upTo = Math.round((stopAt * 100) / notice.limit);
    const sms =
      `Lytro: ${shopName} has used all its ${names.en}. It keeps working up to ${String(upTo)}%, ` +
      'then stops. Get more room from your dashboard.';
    return bn
      ? {
          subject: `${shopName}: আপনার ${name} শেষ`,
          body:
            `${shopName} এই সাইকেলের ${name}-এর পুরো ${limit} ব্যবহার করে ফেলেছে। আপাতত ${until} পর্যন্ত ` +
            `${served.bn.what}; তারপর সাইকেল শেষ হওয়া পর্যন্ত, ${resets} পর্যন্ত, বন্ধ থাকবে, যদি না আরও জায়গা পায়।` +
            `${packs}${room}`,
          sms,
        }
      : {
          subject: `${shopName}: your ${name} is used up`,
          body:
            `${shopName} has used all ${limit} of its ${name} for this cycle. Its ${served.en.what} for now, up to ` +
            `${until}; then they stop until the cycle ends on ${resets}, unless it has more room.${packs}${room}`,
          sms,
        };
  }
  const percent = notice.level === 'stopped' ? 100 : notice.level;
  const pace = SERVING_METRICS.has(notice.metric) ? paceLine(notice, usage, now, language) : '';
  const sms = `Lytro: ${shopName} has used ${String(percent)}% of its ${names.en}. Get more room from your dashboard.`;
  return bn
    ? {
        subject: `${shopName}: আপনার ${name}-এর ${String(percent)}% ব্যবহার হয়েছে`,
        body: `${shopName} এর ${limit} ${name}-এর মধ্যে ${used} ব্যবহার করেছে (${String(percent)}%)।${pace}${room}`,
        sms,
      }
    : {
        subject: `${shopName}: ${String(percent)}% of your ${name} used`,
        body: `${shopName} has used ${used} of its ${limit} ${name} (${String(percent)}%).${pace}${room}`,
        sms,
      };
}

/** RTE-12: the operators' copy of a fast-spend alert, in English (D7-43). */
export function operatorAlertText(
  notice: UsageNotice,
  shop: { shopName: string; slug: string },
): { subject: string; body: string } {
  const share = Math.round((notice.used * 100) / notice.limit);
  return {
    subject: `Fast API spending: ${shop.slug}`,
    body:
      `${shop.shopName} (${shop.slug}) made ${String(notice.used)} API requests in one hour, ${String(share)}% of the ` +
      `${String(notice.limit)} its cycle allows. Nothing was refused. If it is an attack, its monthly quota can be ` +
      'raised for it with an override (PLN-11).',
  };
}

/**
 * LIM-01 (agreed for Slice 10): which notices also go by SMS -- the platform pays. Only bandwidth and API requests, which
 * stop shoppers: at 100 percent and at the stop always, and at 95 percent to an owner with no email.
 */
export function smsDue(notice: UsageNotice, ownerHasEmail: boolean): boolean {
  if (!SERVING_METRICS.has(notice.metric)) return false;
  if (notice.level === 100 || notice.level === 'stopped') return true;
  return notice.level === 95 && !ownerHasEmail;
}
