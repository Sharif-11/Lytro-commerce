// Words the app shows where the prototype shows an example shop's facts (docs/brand/lytro-storefront.html draws
// "Megh", its ৳70/৳130 zones and its phone number into a few lines). Each line here either replaces one of those with
// a line that takes the shop's real values, or is a line the prototype had no screen for. COPY stays as drawn.
export const APP_COPY = {
  // The prototype draws two fixed zones; a shop has its own, so the range is built from them (SFT-20).
  deliv_range: ['{from} – {to}', '{from} – {to}'],
  // LIF-07: a closed shop is named to nobody, so its page cannot say whose it is.
  off_p: [
    'দোকানটি এই মুহূর্তে বন্ধ আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
    'This shop is temporarily unavailable. Please try again a little later.',
  ],
  // ATR-07: the prototype names the example's sold-out pair; any product's pick is said the same way.
  unavailable_hint: [
    'এই কম্বিনেশনটা শেষ। অন্য অপশন বেছে নিন।',
    'This one is sold out. Pick another option.',
  ],
  // DLV-06: the shop's own phone, when it has one, in place of the example's.
  no_delivery_hint: ['অন্য ঠিকানা দিন।', 'Try another address.'],
  no_delivery_call: ['অন্য ঠিকানা দিন, বা {p}-এ কথা বলুন।', 'Try another address, or call {p}.'],
  // DLV-07: a product limited to more than one zone names them all.
  delivers_only: ['শুধু {z}-এ ডেলিভারি হয়', 'Delivers to {z} only'],
  // PRD-17: a chart the shop gave as a photo.
  sc_image: ['সাইজ চার্টের ছবি', 'Size chart image'],
  // ATR-04: a yes-or-no detail, and the buttons the prototype draws only as icons.
  attr_yes: ['হ্যাঁ', 'Yes'],
  attr_no: ['না', 'No'],
  close: ['বন্ধ করুন', 'Close'],
  back: ['পেছনে যান', 'Back'],
  // UOM-02: the units a measured detail or option is written in, as the dashboard names them.
  unit_g: ['গ্রাম', 'g'],
  unit_kg: ['কেজি', 'kg'],
  unit_ml: ['মি.লি.', 'ml'],
  unit_l: ['লিটার', 'L'],
  // Slice 12b: the search overlay's way out, which the prototype writes in place; Bangla by the user's glossary.
  cancel: ['ক্যানসেল', 'Cancel'],
  // The prototype's counts, for exactly one ("1 products" otherwise); Bangla has one form.
  products_one: ['{n}টি প্রোডাক্ট', '{n} product'],
  cart_one: ['{n}টি আইটেম', '{n} item'],
  // Slice 4.8e: where the prototype names its example -- a product, a tax, a size -- each with the shop's real one.
  tax_in: ['এর মধ্যে {name} {rate}%', 'Includes {name} {rate}%'],
  adv_t_n: ['{p}-এ ৳{n} অ্যাডভান্স লাগে', '{p} needs a ৳{n} advance'],
  adv_t: ['{p}-এ আগে পেমেন্ট লাগে', '{p} needs paying first'],
  short_t: ['{p} এইমাত্র শেষ হয়ে গেছে', '{p} just sold out'],
  short_any: ['একটি আইটেম এইমাত্র শেষ হয়ে গেছে', 'An item just sold out'],
  out_t: ['{p} স্টকে নেই', '{p} is sold out'],
  gone_t: ['{p} আর বিক্রি হচ্ছে না', '{p} is no longer sold'],
  refit_t: ['{p}-এর অপশন বদলে গেছে', "{p}'s options changed"],
  combo_pick: ['প্রতিটির জন্য একটি বেছে নিন', 'Pick one for each'],
  rule_optional: ['ঐচ্ছিক · সর্বোচ্চ {n}টি', 'Optional · at most {n}'],
  rule_pick: ['{n}টি বাছুন', 'Pick {n}'],
  rule_range: ['{a} থেকে {b}টি বাছুন', 'Pick {a} to {b}'],
  // The prototype writes these in place, with its example customer.
  name_ph: ['যেমন: রুমানা আক্তার', 'e.g. Rumana Akter'],
  // Slice 4.8e, part 2: words the prototype writes in place.
  next_step: ['পরের ধাপ', 'Next'],
  save_action: ['সেভ করুন', 'Save'],
  edit: ['এডিট', 'Edit'],
  password_now: ['এখনকার পাসওয়ার্ড', 'Current password'],
  password_new: ['নতুন পাসওয়ার্ড', 'New password'],
  // Not drawn: the order's own discount, which staff may set, so its total still adds up.
  discount: ['ছাড়', 'Discount'],
} as const satisfies Record<string, readonly [string, string]>;
