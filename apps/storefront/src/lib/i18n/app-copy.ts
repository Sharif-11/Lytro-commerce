// Words the app shows where the prototype shows an example shop's facts (docs/brand/lytro-storefront.html draws
// "Megh", its ৳70/৳130 zones and its phone number into a few lines). Each line here either replaces one of those with
// a line that takes the shop's real values, or is a line the prototype had no screen for. COPY stays as drawn.
export const APP_COPY = {
  // The prototype draws two fixed zones; a shop has its own, so the range is built from them (SFT-20).
  deliv_range: ['{from} – {to}', '{from} – {to}'],
  // Slice 12 (agreed 2026-10-29): the order form is laid out but not sent until Phase 4, said in one line.
  landing_soon: ['অনলাইনে অর্ডার শিগগিরই চালু হবে।', 'Online ordering opens soon.'],
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
} as const satisfies Record<string, readonly [string, string]>;
