// Words the app shows where the prototype shows an example shop's facts (docs/brand/lytro-storefront.html draws
// "Megh", its ৳70/৳130 zones and its phone number into a few lines). Each line here either replaces one of those with
// a line that takes the shop's real values, or is a line the prototype had no screen for. COPY stays as drawn.
export const APP_COPY = {
  // Slice 5.8's part 2 (STOREFRONT-DESIGN §8a): the wallets at checkout, and the return.
  pay58Gateway: [
    '{w}-এর নিজের পেজে পেমেন্ট; টাকা কাটলেই হয়ে যাবে',
    "Pay on {w}'s own page; it is done as soon as the money moves",
  ],
  pay58Manual: [
    'টাকা পাঠিয়ে TrxID দিন; মিলিয়ে কনফার্ম করা হবে',
    'Send the money and enter the TrxID; it is matched and confirmed',
  ],
  pay58Bank: [
    'ব্যাংকে টাকা পাঠিয়ে রেফারেন্স দিন; শপ দেখে কনফার্ম করবে',
    'Transfer the money and enter the reference; the shop checks and confirms',
  ],
  pay58Next: ['পরের পেজে পেমেন্ট করবেন', 'You pay on the next page'],
  pay58PlaceAny: ['অর্ডার দিয়ে পেমেন্ট করুন', 'Place order and pay'],
  pay58NoneT: [
    'এই শপ এখন অনলাইনে পেমেন্ট নিচ্ছে না',
    "This shop isn't taking online payments right now",
  ],
  pay58NoneP: [
    '{p}-এ ৳{n} অগ্রিম লাগে, তাই এটা এখন অর্ডার করা যাবে না। এটা সরিয়ে বাকিটা অর্ডার করুন, বা শপকে কল করুন।',
    "{p} needs a ৳{n} advance, so it can't be ordered right now. Remove it and order the rest, or call the shop.",
  ],
  pay58NonePAny: [
    '{p}-এ আগে পেমেন্ট লাগে, তাই এটা এখন অর্ডার করা যাবে না। এটা সরিয়ে বাকিটা অর্ডার করুন, বা শপকে কল করুন।',
    "{p} has to be paid for first, so it can't be ordered right now. Remove it and order the rest, or call the shop.",
  ],
  pay58NoneOne: [
    '{p}-এ ৳{n} অগ্রিম লাগে, তাই এটা এখন অর্ডার করা যাবে না। অর্ডার করতে শপকে কল করুন।',
    "{p} needs a ৳{n} advance, so it can't be ordered right now. Call the shop to order it.",
  ],
  pay58NoneOneAny: [
    '{p}-এ আগে পেমেন্ট লাগে, তাই এটা এখন অর্ডার করা যাবে না। অর্ডার করতে শপকে কল করুন।',
    "{p} has to be paid for first, so it can't be ordered right now. Call the shop to order it.",
  ],
  pay58NoneLate: [
    'অর্ডারটি হয়নি, টাকাও কাটেনি। শপকে কল করে অর্ডার করতে পারেন।',
    "The order wasn't placed and no money moved. You can call the shop to order.",
  ],
  pay58CapT: [
    'এই শপ আজ আর অনলাইনে পেমেন্ট নিতে পারছে না',
    "This shop can't take more online payments today",
  ],
  pay58CapP: [
    'অর্ডারটি হয়নি, টাকাও কাটেনি। কাল আবার চেষ্টা করুন, বা শপকে কল করুন।',
    "The order wasn't placed and no money moved. Try again tomorrow, or call the shop.",
  ],
  pay58MethodGone: [
    'এই পেমেন্ট মেথড এখন নেই। পেজটি আবার খুলে অন্য একটি বেছে নিন।',
    "This way of paying isn't available now. Open the page again and choose another.",
  ],
  pay58PaidT: ['পেমেন্ট পাওয়া গেছে', 'Payment received'],
  pay58PaidP: [
    'অর্ডার {o}। শপ কল করে অর্ডার কনফার্ম করবে।',
    'Order {o}. The shop will call to confirm it.',
  ],
  pay58Paid: ['অগ্রিম দিয়েছেন', 'Advance paid'],
  pay58CheckT: ['পেমেন্ট চেক করা হচ্ছে', 'Checking your payment'],
  pay58CheckP: [
    'অর্ডার {o} ধরে রাখা আছে। এই পেজ বন্ধ করলেও হবে; কনফার্ম হলে এখানে দেখতে পাবেন।',
    "Order {o} is being held. You can close this page; it will show here once it's confirmed.",
  ],
  pay58FixId: ['TrxID ভুল দিয়েছেন? বদলান', 'Wrong TrxID? Change it'],
  pay58UnpaidP: [
    'অর্ডার {o} আরও {m} মিনিট ধরে রাখা আছে। আবার চেষ্টা করুন; সমস্যা হলে শপকে কল করুন।',
    'Order {o} is held for {m} more minutes. Try again, or call the shop if something is wrong.',
  ],
  pay58GoneT: ['সময় শেষ, অর্ডারটি ক্যানসেল হয়েছে', 'Time ran out, so the order was cancelled'],
  pay58GoneP: [
    'টাকা পাঠিয়ে থাকলে শপকে কল করে TrxID জানান। না পাঠিয়ে থাকলে আবার অর্ডার করতে পারেন।',
    'If you already sent the money, call the shop with the TrxID. If not, you can order again.',
  ],
  pay58RejectedT: [
    'পেমেন্ট কনফার্ম হয়নি, অর্ডারটি ক্যানসেল হয়েছে',
    'Payment not confirmed, so the order was cancelled',
  ],
  pay58RejectedP: [
    'টাকা পাঠিয়ে থাকলে শপকে কল করে জানান। চাইলে আবার অর্ডার করতে পারেন।',
    'If you did send the money, call the shop. You can also order again.',
  ],
  pay58Again: ['আবার অর্ডার করুন', 'Order again'],
  pay58TrackDueT: ['৳{n} অগ্রিম এখনো বাকি', '৳{n} advance still to pay'],
  pay58TrackDueP: [
    '{m} মিনিটের মধ্যে পেমেন্ট না হলে অর্ডারটি ক্যানসেল হবে।',
    "If it isn't paid within {m} minutes, the order is cancelled.",
  ],
  pay58PayNow: ['পেমেন্ট করুন', 'Pay now'],
  pay58TrackCheckP: ['কনফার্ম হলে এখানে দেখতে পাবেন।', "It will show here once it's confirmed."],
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
  // UOM-05 (PD-19): a counted unit beside its quantity, as the prototype's "1 পিস" (u_piece) writes a piece.
  u_dozen: ['ডজন', 'dozen'],
  u_dozens: ['ডজন', 'dozen'],
  u_pack: ['প্যাক', 'pack'],
  u_packs: ['প্যাক', 'packs'],
  u_box: ['বক্স', 'box'],
  u_boxes: ['বক্স', 'boxes'],
  // PD-21 (STOREFRONT-DESIGN §7f): a cart line taken out, and the way to put it back, for 5 seconds.
  cart_removed: ['কার্ট থেকে সরানো হলো', 'Removed from your cart'],
  cart_undo: ['ফিরিয়ে আনুন', 'Undo'],
  // ATR-19 (PD-4): a photo card's name for a screen reader; nothing is written on the card.
  pd_photo: ['ছবি {n}', 'Photo {n}'],
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
