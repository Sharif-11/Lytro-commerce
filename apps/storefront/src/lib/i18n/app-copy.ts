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
  rule_pick: ['{n}টি সিলেক্ট করুন', 'Pick {n}'],
  rule_range: ['{a} থেকে {b}টি সিলেক্ট করুন', 'Pick {a} to {b}'],
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
  // STOREFRONT-BUILDER-PLAN: the designed home's words (docs/brand/lytro-storefront-builder.html). Delivery is the
  // range of the shop's own zones' charges, as the home said before: zones carry the shop's own names.
  sb_offer: ['অফার', 'Offer'],
  sb_offers: ['অফার', 'Offers'],
  sb_all: ['সব প্রোডাক্ট', 'All products'],
  sb_shop_h: ['কেনাকাটা', 'Shop'],
  sb_contact: ['যোগাযোগ', 'Contact'],
  // The owner, 2026-11-19: the shop's WhatsApp and Facebook page by name in the footer's contact column.
  sb_whatsapp: ['WhatsApp', 'WhatsApp'],
  sb_facebook_page: ['Facebook পেজ', 'Facebook page'],
  sb_offers_line: ['{n}টি পণ্যে {p}% পর্যন্ত ছাড় চলছে', 'Up to {p}% off on {n} products'],
  sb_delivery: ['ডেলিভারি {r}', 'Delivery {r}'],
  // STOREFRONT-BUILDER-PLAN BL-10: the bar's delivery line, each zone by the shop's name for it ({z}).
  sb_bar_home_max: ['{z} ডেলিভারি সর্বোচ্চ {c}', '{z}: delivery up to {c}'],
  sb_bar_home_from: ['{z} ডেলিভারি {c} থেকে', '{z}: delivery from {c}'],
  sb_bar_away_max: ['{z} সর্বোচ্চ {c}', '{z}: up to {c}'],
  sb_bar_away_from: ['{z} {c} থেকে', '{z}: from {c}'],
  // BL-12: a tile's or a banner's words for the offers.
  sb_offers_on: ['অফার চলছে', 'Offers on'],
  sb_on_n: ['{n}টি পণ্যে', 'On {n} products'],
  // BL-11: the header's order tracking.
  sb_track_h: ['অর্ডার ট্র্যাক', 'Track order'],
  sb_track_where: ['অর্ডার কোথায় আছে', 'Where your order is'],
  // The owner, 2026-11-19: the menu's drawer on a phone.
  sb_help: ['সাহায্য', 'Help'],
  sb_my_account: ['আমার অ্যাকাউন্ট', 'My account'],
  sb_chat_whatsapp: ['WhatsApp-এ চ্যাট', 'Chat on WhatsApp'],
  sb_language: ['ভাষা', 'Language'],
  sb_shop_by: ['ক্যাটাগরি অনুযায়ী কিনুন', 'Shop by category'],
  sb_n_products: ['{n}টি পণ্য', '{n} products'],
  sb_just_in: ['নতুন এসেছে', 'Just in'],
  sb_on_sale: ['অফার কালেকশন', 'On sale'],
  sb_best_sellers: ['সবচেয়ে বেশি বিক্রি', 'Best sellers'],
  sb_picked: ['আমাদের পছন্দ', 'Our picks'],
  sb_best: ['সেরা বিক্রি', 'Best seller'],
  sb_left: ['মাত্র {n}টি বাকি', 'Only {n} left'],
  sb_ordered: ['{n} বার অর্ডার হয়েছে', 'Ordered {n} times'],
  sb_view: ['দেখুন', 'View'],
  sb_shop: ['দেখুন', 'Shop'],
  sb_cod: ['ক্যাশ অন ডেলিভারি', 'Cash on delivery'],
  sb_cod_sub: ['হাতে পেয়ে টাকা দিন', 'Pay when it arrives'],
  sb_nationwide: ['সারাদেশে ডেলিভারি', 'Nationwide delivery'],
  sb_pay_by: ['{w} দিয়ে পেমেন্ট', 'Pay by {w}'],
  sb_or_cod: ['অথবা ডেলিভারিতে', 'or on delivery'],
  sb_track: ['অর্ডার ট্র্যাক করুন', 'Track your order'],
  sb_any_time: ['যেকোনো সময়', 'Any time'],
  sb_quotes: ['ক্রেতারা যা বলছেন', 'What our customers say'],
  sb_up_to: ['{p}% পর্যন্ত ছাড়', 'Up to {p}% off'],
  sb_save: ['{p}% ছাড়', '{p}% off'],
  sb_new_kick: ['নতুন কালেকশন', 'New collection'],
  // SB-12: the draft's preview.
  sb_preview_bar: [
    'প্রিভিউ: ক্রেতারা এখনো এটা দেখছেন না। পাবলিশ করলে দেখবেন।',
    "Preview: shoppers don't see this yet. They will once you publish.",
  ],
  sb_preview_ended_h: ['প্রিভিউ শেষ', 'Preview ended'],
  sb_preview_ended: [
    'এই প্রিভিউ লিংকের মেয়াদ শেষ। ড্যাশবোর্ড থেকে আবার প্রিভিউ খুলুন।',
    'This preview link has ended. Open the preview again from your dashboard.',
  ],
  // OFFERS-PLAN OF-8, OF-12: an offer's page -- its tag, its line, and the note once it has ended.
  of_pill: ['অফার', 'Offer'],
  of_line_percent: ['{n}টি পণ্যে {cut}% ছাড়', '{cut}% off {n} products'],
  of_line_taka: ['{n}টি পণ্যে {cut} ছাড়', '{cut} off {n} products'],
  of_ended: ['এই অফার শেষ হয়ে গেছে', 'This offer has ended'],
  of_ended_line: [
    'প্রোডাক্টগুলো এখন তাদের নিজের দামে।',
    'The products are at their own prices now.',
  ],
  of_on_sale_now: ['এখন যেসব পণ্যে ছাড় চলছে', "What's on sale now"],
  // The one product page (the owner, 2026-11-24; the builder sketch's `pp-page`): the product and its order form on one
  // page, with Bonik's best parts. Nothing here tells a shopper how the system works (the owner, the same day).
  pp_another: ['আরেকটা সাইজ বা ডিজাইন যোগ করুন', 'Add another size or design'],
  pp_second: ['আরও একটা', 'One more'],
  pp_remove: ['সরান', 'Remove'],
  pp_form_t: ['অর্ডার করতে তথ্য দিন', 'Your details to order'],
  pp_form_s: [
    '30 সেকেন্ডে অর্ডার, এখন কোনো টাকা লাগবে না',
    'Order in 30 seconds; nothing to pay now',
  ],
  pp_form_s_adv: ['30 সেকেন্ডে অর্ডার', 'Order in 30 seconds'],
  pp_note: ['+ দোকানকে কিছু বলতে চাইলে লিখুন', '+ A note for the shop'],
  pp_pay_arrive: ['পণ্য হাতে পেয়ে দেবেন {n}', 'Pay {n} when it arrives'],
  pp_track: ['অর্ডারের পর একটা ট্র্যাকিং লিংক পাবেন', 'You get a tracking link after ordering'],
  pp_t1: ['হাতে পেয়ে টাকা', 'Pay on delivery'],
  pp_t1s: ['অগ্রিম লাগবে না', 'Nothing in advance'],
  pp_t1a: ['অল্প অগ্রিম', 'A small advance'],
  pp_t1as: ['বাকিটা হাতে পেয়ে', 'The rest on delivery'],
  pp_t1f: ['আগে পেমেন্ট', 'Paid first'],
  pp_t1fs: ['bKash বা Nagad-এ', 'By bKash or Nagad'],
  pp_t2: ['সারাদেশে ডেলিভারি', 'Delivery nationwide'],
  pp_t2s: ['ঘরে বসে পাবেন', 'To your door'],
  pp_t2l: ['ডেলিভারি', 'Delivery'],
  pp_t3: ['সহজে অর্ডার', 'Easy ordering'],
  pp_t3s: ['30 সেকেন্ডেই হয়ে যায়', 'Done in 30 seconds'],
  pp_read_more: ['পুরো বিবরণ পড়ুন', 'Read the full description'],
  pp_read_less: ['কম দেখান', 'Show less'],
  pp_photos: ['আরও ছবি', 'More photos'],
  pp_how: ['অর্ডার যেভাবে হয়', 'How ordering works'],
  pp_s1: ['ফর্মে তথ্য দিন', 'Fill in the form'],
  pp_s2: ['দোকান ফোন করে কনফার্ম করবে', 'The shop calls to confirm'],
  pp_s3: ['পণ্য হাতে পেয়ে টাকা দিন', 'Pay when it arrives'],
  pp_s3a: ['অগ্রিম দিন, বাকিটা হাতে পেয়ে', 'Pay the advance, the rest on arrival'],
  pp_s3f: ['পেমেন্ট করুন, পণ্য ঘরে আসবে', 'Pay, and it comes to your door'],
  pp_faq: ['সাধারণ প্রশ্ন', 'Common questions'],
  pp_q1: ['ডেলিভারি চার্জ কত?', 'What does delivery cost?'],
  pp_a1: [
    '{list}। থানা বাছলে সঠিক চার্জ দেখা যায়।',
    '{list}. Pick your thana to see the exact charge.',
  ],
  pp_q2: ['টাকা কখন দিতে হবে?', 'When do I pay?'],
  pp_a2: [
    'পণ্য হাতে পেয়ে ডেলিভারি ম্যানকে টাকা দেবেন। অগ্রিম কিছু লাগবে না।',
    'Pay the delivery person when it arrives. Nothing in advance.',
  ],
  pp_a2a: [
    'অর্ডার কনফার্ম করতে ৳{n} অগ্রিম bKash বা Nagad-এ, বাকিটা পণ্য হাতে পেয়ে।',
    '৳{n} in advance by bKash or Nagad confirms the order; the rest when it arrives.',
  ],
  pp_a2d: [
    'ডেলিভারি চার্জ অগ্রিম bKash বা Nagad-এ, বাকিটা পণ্য হাতে পেয়ে।',
    'The delivery charge in advance by bKash or Nagad; the rest when it arrives.',
  ],
  pp_a2f: [
    'অর্ডারের সময় পুরো টাকা bKash বা Nagad-এ দিতে হবে।',
    'The whole amount is paid by bKash or Nagad when you order.',
  ],
  pp_q3: ['অর্ডারের পর কী হবে?', 'What happens after I order?'],
  pp_a3: [
    'দোকান আপনাকে ফোন করে অর্ডার কনফার্ম করবে, তারপর কুরিয়ারে পাঠাবে। ট্র্যাকিং লিংকে দেখবেন পার্সেল কোথায় আছে।',
    'The shop calls you to confirm, then sends it by courier. The tracking link shows where the parcel is.',
  ],
  pp_q4: [
    'একসাথে কয়েকটা সাইজ বা ডিজাইন নেওয়া যাবে?',
    'Can I order several sizes or designs together?',
  ],
  pp_a4: [
    'হ্যাঁ। "আরেকটা সাইজ বা ডিজাইন যোগ করুন" চাপুন; সব এক অর্ডারে, এক ডেলিভারি চার্জে আসবে।',
    'Yes. Tap "Add another size or design"; they all come in one order, for one delivery charge.',
  ],
  pp_facts: ['পণ্যের তথ্য', 'Product facts'],
  pp_facts_p: [
    '{p} এখন পাচ্ছেন {n}-এ। {s} থেকে অনলাইনে অর্ডার করুন: {pay}।',
    '{p} is now {n}. Order online from {s}: {pay}.',
  ],
  pp_f_cod: ['ক্যাশ অন ডেলিভারি, অগ্রিম টাকা লাগবে না', 'cash on delivery, nothing in advance'],
  pp_price: ['দাম', 'Price'],
  pp_regular: ['আগের দাম', 'Regular price'],
  pp_regular_v: ['{n} ({p}% ছাড়)', '{n} ({p}% off)'],
  pp_category: ['ক্যাটাগরি', 'Category'],
  pp_shop: ['দোকান', 'Shop'],
  pp_dcharge: ['ডেলিভারি চার্জ', 'Delivery charge'],
  pp_payment: ['পেমেন্ট', 'Payment'],
  pp_more_shop: ['এই দোকানের আরও পণ্য', 'More from this shop'],
  pp_all: ['সব প্রোডাক্ট দেখুন', 'See every product'],
  // STOREFRONT-BUILDER-PLAN SB-33 (the owner, 2026-11-26): what a page with no products says, and where it leads. Nothing
  // technical and no blame.
  em_soon: ['নতুন কালেকশন শিগগিরই আসছে', 'New collection coming soon'],
  em_ask_h: ['কিছু খুঁজছেন?', 'Looking for something?'],
  em_ask_p: [
    'মেসেজ করুন, কী আছে আর কী আসছে জানিয়ে দেব।',
    "Message us and we'll tell you what we have and what's coming.",
  ],
  em_ask_fb: [
    'নতুন কালেকশনের খবর পাবেন আমাদের ফেসবুক পেজে।',
    "You'll find news of the new collection on our Facebook page.",
  ],
  em_later_h: ['শিগগিরই আবার আসুন', 'Come back soon'],
  em_later_p: [
    'আমরা শপ সাজাচ্ছি। কিছুদিন পর নতুন প্রোডাক্ট দেখতে পাবেন।',
    "We're getting the shop ready. New products will be here in a few days.",
  ],
  em_list_p: [
    'আমরা শপ সাজাচ্ছি। কী আসছে জানতে মেসেজ করুন।',
    "We're getting the shop ready. Message us to hear what's coming.",
  ],
  em_wa: ['WhatsApp-এ মেসেজ করুন', 'Message on WhatsApp'],
  em_call: ['কল করুন', 'Call'],
  em_fb: ['ফেসবুক পেজে দেখুন', 'See our Facebook page'],
  em_cat_h: [
    'এই ক্যাটাগরিতে নতুন প্রোডাক্ট শিগগিরই আসছে',
    'New products for this category are coming soon',
  ],
  em_cat_p: ['ততক্ষণ শপের অন্য প্রোডাক্টগুলো দেখুন।', 'Meanwhile, see what else the shop has.'],
  em_more_shop: ['এই শপের আরও প্রোডাক্ট', 'More from this shop'],
  em_search_h: ['“{q}” পাওয়া যায়নি', 'Nothing found for “{q}”'],
  em_search_p: ['অন্য বানানে বা ছোট শব্দে খুঁজুন।', 'Try another spelling or a shorter word.'],
  em_popular: ['জনপ্রিয় প্রোডাক্ট', 'Popular products'],
  em_offers_h: ['এখন কোনো অফার চলছে না', 'No offers running right now'],
  em_offers_p: ['নতুন অফার এলে এখানেই দেখাবে।', 'New offers will show here.'],
  em_stock_h: ['স্টকে থাকা কোনো প্রোডাক্ট নেই', 'Nothing in stock right now'],
  em_stock_all: ['সবগুলো দেখুন', 'See them all'],
  em_gone_p: ['শপের অন্য প্রোডাক্টগুলো দেখুন।', 'See what else the shop has.'],
} as const satisfies Record<string, readonly [string, string]>;
