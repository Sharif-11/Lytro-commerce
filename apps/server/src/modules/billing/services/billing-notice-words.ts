import type { Bilingual, MailWords } from '../../../common/i18n/bilingual';

/**
 * LIF-18, PLN-14, PLN-15, DWN-11, DWN-14, BIL-05, BIL-14 (Slice 7.3's read, agreed 2026-11-07): what the owner reads of
 * their shop's plan, add-ons and lifecycle, in Bangla and English, one definition each. The email goes in the owner's
 * own language; an SMS of the same notice keeps the English words, as it always has (KNOWN-GAPS §127).
 */

/** An item's name with its count, as a notice names it. */
export function countedName(name: Bilingual<string>, quantity: number): Bilingual<string> {
  return quantity === 1
    ? name
    : { bn: `${name.bn} x${String(quantity)}`, en: `${name.en} x${String(quantity)}` };
}

/** PLN-14: why an add-on will not renew. */
export const ADDON_NOT_RENEWING = {
  switchedOff: {
    bn: 'এর রিনিউ বন্ধ করা আছে। রাখতে চাইলে অ্যাড-অন পেজ থেকে চালু করুন।',
    en: 'its renewal is switched off. Switch it on from the add-ons page to keep it.',
  },
  unlimited: {
    bn: 'আপনার প্ল্যানে এটি যা যোগ করে তার আর কোনো লিমিট নেই, তাই এটি আর লাগবে না।',
    en: 'your plan no longer limits what it adds, so it is not needed.',
  },
  shortWithPlan: {
    bn: 'প্ল্যানের সাথে এটি রিনিউ করার মতো ব্যালেন্স নেই। রাখতে চাইলে টপ-আপ করুন।',
    en: 'your balance is too short to renew it with your plan. Top up to keep it.',
  },
  featureRetired: {
    bn: 'এটি আর বিক্রি হয় না, শেষ হলে বন্ধ হয়ে যাবে।',
    en: 'it is no longer sold, and switches off when it ends.',
  },
  retired: { bn: 'এটি আর বিক্রি হয় না।', en: 'it is no longer sold.' },
} satisfies Record<string, Bilingual<string>>;

/** PLN-14: the balance is this much short of renewing an add-on. */
export function addonShortBy(taka: string): Bilingual<string> {
  return {
    bn: `রিনিউ করতে আপনার ব্যালেন্সে ${taka} TK কম আছে। রাখতে চাইলে টপ-আপ করুন।`,
    en: `your balance is ${taka} TK short of renewing it. Top up to keep it.`,
  };
}

/** PLN-14: a retired limit add-on, and the limit the shop goes back to. */
export function addonRetiredLimit(after: number): Bilingual<string> {
  return {
    bn: `এটি আর বিক্রি হয় না। শেষ হলে আপনার লিমিট আবার ${String(after)} হবে।`,
    en: `it is no longer sold. Your limit goes back to ${String(after)} when it ends.`,
  };
}

/** PLN-14: an add-on ends soon and will not renew, and why. */
export function addonEndingWords(
  name: Bilingual<string>,
  endsOn: string,
  why: Bilingual<string>,
): MailWords {
  return {
    bn: {
      subject: 'একটি অ্যাড-অন শীঘ্রই শেষ হচ্ছে',
      body: `${name.bn} ${endsOn} তারিখে শেষ হবে, রিনিউ হবে না: ${why.bn}`,
    },
    en: {
      subject: 'An add-on ends soon',
      body: `${name.en} ends on ${endsOn} and will not renew: ${why.en}`,
    },
  };
}

/** PLN-15, BND-04: auto-buy bought a pack from the balance. */
export function packBoughtWords(
  pack: Bilingual<string>,
  price: string,
  bought: number,
  cap: number,
): MailWords {
  return {
    bn: {
      subject: 'অটো-বাই একটি প্যাক কিনেছে',
      body:
        `অটো-বাই আপনার ব্যালেন্স থেকে ${price} TK দিয়ে একটি ${pack.bn} কিনেছে ` +
        `(এই সাইকেলে ${String(cap)}টির মধ্যে ${String(bought)}টি)।`,
    },
    en: {
      subject: 'Auto-buy bought a pack',
      body:
        `Auto-buy bought a ${pack.en} for ${price} TK from your balance ` +
        `(${String(bought)} of ${String(cap)} this cycle).`,
    },
  };
}

/** BND-04: auto-buy could not buy a pack, the balance being short. */
export function packFailedWords(pack: Bilingual<string>, short: string, price: string): MailWords {
  return {
    bn: {
      subject: 'অটো-বাই প্যাক কিনতে পারেনি',
      body:
        `অটো-বাই একটি ${pack.bn} কিনতে পারেনি: এর ${price} TK দামের চেয়ে আপনার ব্যালেন্সে ${short} TK কম। ` +
        'গ্রেসের পরেও চালু রাখতে টপ-আপ করে ড্যাশবোর্ড থেকে একটি কিনুন।',
    },
    en: {
      subject: 'Auto-buy could not buy a pack',
      body:
        `Auto-buy could not buy a ${pack.en}: your balance is ${short} TK short of its ${price} TK. ` +
        'Top up and buy one from your dashboard to keep going past the grace.',
    },
  };
}

/** PLN-13: why a paid add-on could not be added. */
export const ADDON_NOT_TAKEN = {
  notAvailable: {
    bn: 'আপনার শপের প্ল্যান আর অ্যাক্টিভ ছিল না',
    en: "your shop's plan was no longer active",
  },
  alreadyActive: { bn: 'আপনার শপে এটি আগে থেকেই ছিল', en: 'your shop already had it' },
  unlimited: {
    bn: 'আপনার প্ল্যানে এটি যা যোগ করে তার আর কোনো লিমিট নেই',
    en: 'your plan no longer limits what it adds',
  },
} satisfies Record<string, Bilingual<string>>;

/** PLN-13: an add-on's payment went to the balance, the add-on not being taken. */
export function addonPaymentToBalanceWords(
  amount: string,
  addon: Bilingual<string>,
  why: Bilingual<string>,
): MailWords {
  return {
    bn: {
      subject: 'আপনার অ্যাড-অন পেমেন্ট ব্যালেন্সে যোগ হয়েছে',
      body:
        `${addon.bn}-এর জন্য আপনার ${amount} TK পেমেন্ট দিয়ে এটি যোগ করা যায়নি, কারণ ${why.bn}। ` +
        `${amount} TK তার বদলে আপনার ব্যালেন্সে যোগ হয়েছে।`,
    },
    en: {
      subject: 'Your add-on payment went to your balance',
      body:
        `Your payment of ${amount} TK for ${addon.en} could not add it, because ${why.en}. ` +
        `The ${amount} TK has been added to your balance instead.`,
    },
  };
}

/** PLN-14, BIL-17: these add-ons did not renew, the balance being this much short. */
export function addonsNotRenewedWords(names: Bilingual<string>, short: string): MailWords {
  return {
    bn: {
      subject: 'কিছু অ্যাড-অন রিনিউ হয়নি',
      body:
        `এই অ্যাড-অনগুলো আপনার ব্যালেন্স থেকে রিনিউ হয়নি: ${names.bn}। রিনিউ করতে আপনার ব্যালেন্সে ${short} TK কম ` +
        'ছিল। এগুলো শেষ হয়ে গেছে; অ্যাড-অন পেজ থেকে আবার কিনতে পারবেন।',
    },
    en: {
      subject: 'Some add-ons did not renew',
      body:
        `These add-ons did not renew from your balance: ${names.en}. Your balance was ${short} TK short ` +
        'of renewing them. They have ended; you can buy them again from the add-ons page.',
    },
  };
}

/** DWN-14: what each limit a downgrade checks is called. */
export const OVER_LIMIT_NAMES: Readonly<Record<string, Bilingual<string>>> = {
  staff: { bn: 'স্টাফ সিট', en: 'seats' },
  products: { bn: 'প্রোডাক্ট', en: 'products' },
  storage_mb: { bn: 'MB স্টোরেজ', en: 'MB of storage' },
};

/** DWN-14: the final warning: each limit still over, that nothing is lost, and the export (LIF-16). */
export function downgradeFinalWarningWords(
  open: readonly { key: string; used: number; limit: number }[],
): MailWords {
  const nameOf = (key: string): Bilingual<string> => OVER_LIMIT_NAMES[key] ?? { bn: key, en: key };
  const over = {
    bn: open
      .map((item) => `${String(item.used)} ${nameOf(item.key).bn} (লিমিট ${String(item.limit)})`)
      .join(', '),
    en: open
      .map((item) => `${String(item.used)} of ${String(item.limit)} ${nameOf(item.key).en}`)
      .join(', '),
  };
  return {
    bn: {
      subject: 'আপনার শপ এখনো প্ল্যানের লিমিটের বেশি',
      body:
        `30 দিন আগে আপনার শপের প্ল্যান বদলেছে, তবু এটি এখনো লিমিটের বেশি: ${over.bn}। কিছুই ডিলিট বা লুকানো হয়নি, ` +
        'যা আছে সব আগের মতো বিক্রি হচ্ছে ও দেখা যাচ্ছে। শপ লিমিটের মধ্যে না আসা পর্যন্ত, বা মানানসই প্ল্যানে না যাওয়া ' +
        'পর্যন্ত, নতুন কিছু যোগ করা বন্ধ থাকবে। সেটিংস > এক্সপোর্ট থেকে যেকোনো সময় শপের সব ডেটা ডাউনলোড করতে পারবেন।',
    },
    en: {
      subject: "Your shop is still over its plan's limits",
      body:
        `Since your shop's plan changed 30 days ago, it is still over its limits: ${over.en}. Nothing has been ` +
        'deleted or hidden, and everything already there keeps selling and showing. Adding more stays blocked until ' +
        "the shop is within its limits, or on a plan that fits. You can download all of your shop's data from " +
        'Settings, Export, at any time.',
    },
  };
}

/** DWN-11: a downgrade shortens the activity log's retention, and this many entries will go from this day. */
export function retentionShrinkWords(input: {
  oldDays: number;
  newDays: number;
  trimmed: number;
  /** The day, as each language writes it. */
  from: Bilingual<string>;
}): MailWords {
  const { oldDays, newDays, trimmed, from } = input;
  return {
    bn: {
      subject: 'আপনার ডেটা রাখার সময় বদলাচ্ছে',
      body:
        `আপনার শপের অ্যাক্টিভিটি লগ ${String(oldDays)} দিনের বদলে ${String(newDays)} দিন রাখা হবে। ` +
        `${from.bn} থেকে পুরোনো ${String(trimmed)}টি এন্ট্রি চিরতরে মুছে যাবে।`,
    },
    en: {
      subject: 'Your data retention is changing',
      body:
        `Your shop's activity log retention is shortening from ${String(oldDays)} to ` +
        `${String(newDays)} days. ${String(trimmed)} older entr${trimmed === 1 ? 'y' : 'ies'} ` +
        `will be permanently removed starting ${from.en}.`,
    },
  };
}

/** BIL-14: the plan renews in this many days, or the shop is in its grace period (null). */
export function renewalReminderWords(daysLeft: number | null): MailWords {
  return {
    bn: {
      subject: 'আপনার প্ল্যান শীঘ্রই রিনিউ হবে',
      body:
        daysLeft === null
          ? 'আপনার শপ গ্রেস পিরিয়ডে আছে। ড্যাশবোর্ড ব্যবহার করতে থাকতে এখনই প্ল্যান রিনিউ করুন।'
          : `${String(daysLeft)} দিন পর আপনার প্ল্যান রিনিউ হবে। কোনো বাধা এড়াতে এখনই রিনিউ করুন।`,
    },
    en: {
      subject: 'Your plan is renewing soon',
      body:
        daysLeft === null
          ? 'Your shop is in its grace period. Renew now to avoid losing access to your dashboard.'
          : `Your plan renews in ${String(daysLeft)} day(s). Renew now to avoid any interruption.`,
    },
  };
}

/** LIF-18: the shop will be deleted on this date, this many days from now. */
export function deletionWarningWords(daysLeft: number, deletesOn: string): MailWords {
  return {
    bn: {
      subject: 'আপনার শপ ডিলিট হওয়ার তারিখ ঠিক হয়েছে',
      body:
        `প্ল্যান না কিনলে বা পে-অ্যাজ-ইউ-গো বেছে না নিলে ${deletesOn} তারিখে, ${String(daysLeft)} দিন পর, আপনার শপ ডিলিট হয়ে যাবে। তার আগে ` +
        'ড্যাশবোর্ড থেকে আপনার ডেটা এক্সপোর্ট করে নিন।',
    },
    en: {
      subject: 'Your shop is scheduled for deletion',
      body:
        `Your shop will be deleted on ${deletesOn}, in ${String(daysLeft)} day(s), unless you buy a plan or choose pay-as-you-go. ` +
        'Export your data from the dashboard before then.',
    },
  };
}

/** PYG-21: a quiet pay-as-you-go shop is archived in this many days. */
export function paygArchiveWarningWords(days: number): MailWords {
  return {
    bn: {
      subject: 'আপনার শপ শীঘ্রই আর্কাইভ হবে',
      body:
        `কোনো অ্যাক্টিভিটি না থাকলে ${String(days)} দিন পর আপনার পে-অ্যাজ-ইউ-গো শপ আর্কাইভ হয়ে যাবে। কোনো অর্ডার, ` +
        'নতুন প্রোডাক্ট বা টপ-আপ হলে এই সময় আবার শুরু হবে।',
    },
    en: {
      subject: 'Your shop will be archived soon',
      body:
        `Your pay-as-you-go shop will be archived in ${String(days)} days with no activity. Any order, product ` +
        'creation or top-up resets this.',
    },
  };
}

/** PYG-21: the shop is closed, and its data is deleted on this day. */
export function shopClosedWords(shopName: string, deletesOn: string): MailWords {
  return {
    bn: {
      subject: 'আপনার শপ বন্ধ হয়েছে',
      body:
        `${shopName} বন্ধ হয়েছে। ${deletesOn} তারিখে এর ডেটা ডিলিট হবে। তার আগে পে-অ্যাজ-ইউ-গো বা কোনো প্ল্যান বেছে নিয়ে ` +
        'শপটি আবার খুলতে পারবেন, আর ড্যাশবোর্ড থেকে ডেটা এক্সপোর্ট করতে পারবেন।',
    },
    en: {
      subject: 'Your shop is closed',
      body:
        `${shopName} is closed. Its data will be deleted on ${deletesOn}. Until then you can ` +
        'reopen it by choosing pay-as-you-go or a plan, and export your data from the dashboard.',
    },
  };
}

/** BIL-05: the plan is active until this day, with its invoice. */
/** ADM-15: the shop is told when Lytro records a payment for it. */
export function manualEntryRecordedWords(amount: string): MailWords {
  return {
    bn: {
      subject: 'আপনার পেমেন্ট রেকর্ড হয়েছে',
      body: `${amount} টাকার পেমেন্টটি Lytro আপনার অ্যাকাউন্টে রেকর্ড করেছে।`,
    },
    en: {
      subject: 'Your payment has been recorded',
      body: `Lytro recorded your payment of ${amount} TK on your account.`,
    },
  };
}

/** ADM-15: and when Lytro reverses one, with why. */
export function manualEntryReversedWords(amount: string, reason: string): MailWords {
  return {
    bn: {
      subject: 'একটি পেমেন্ট রিভার্স হয়েছে',
      body: `${amount} টাকার পেমেন্টের রেকর্ড Lytro রিভার্স করেছে। কারণ: ${reason}`,
    },
    en: {
      subject: 'A payment was reversed',
      body: `Lytro reversed its record of your payment of ${amount} TK. Reason: ${reason}`,
    },
  };
}

export function planActiveWords(input: {
  planName: string;
  until: string;
  invoiceNumber: number;
  amount: string;
}): MailWords {
  const { planName, until, invoiceNumber, amount } = input;
  return {
    bn: {
      subject: 'আপনার প্ল্যান অ্যাক্টিভ',
      body: `আপনার ${planName} প্ল্যান ${until} পর্যন্ত অ্যাক্টিভ। ইনভয়েস #${String(invoiceNumber)}, ${amount} TK।`,
    },
    en: {
      subject: 'Your plan is active',
      body: `Your ${planName} plan is active until ${until}. Invoice #${String(invoiceNumber)}, ${amount} TK.`,
    },
  };
}
