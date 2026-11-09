// PAY-22, PAYMENT-PAGE-DESIGN §1 and §2: every word on the payment page, Bangla first, as docs/brand/lytro-payment-page.html
// words them. Figures are Western digits, as everywhere in Lytro's Bangla.
const WORDS = {
  title: ['পেমেন্ট', 'Payment'],
  viewDetails: ['বিস্তারিত', 'View Details'],
  mobileBanking: ['মোবাইল ব্যাংকিং', 'Mobile Banking'],
  bankTransfer: ['ব্যাংক ট্রান্সফার', 'Bank Transfer'],
  bankTile: ['ব্যাংক', 'Bank'],
  pay: ['পেমেন্ট: {a} টাকা', 'Pay {a} BDT'],
  orderRef: ['অর্ডার {o}', 'Order {o}'],
  timeLeft: ['সময় বাকি', 'Time left'],
  noteLead: ['নোট:', 'Note:'],
  note: [
    'টাকা পাঠানোর 5-10 সেকেন্ড পর ভেরিফাই করবেন।',
    'verify 5 to 10 seconds after sending the money.',
  ],
  shopNoteLead: ['দোকানের নোট:', 'From the shop:'],
  enterTrx: ['ট্রান্সজেকশন আইডি দিন', 'Enter the transaction ID'],
  fixTrx: ['সঠিক ট্রান্সজেকশন আইডি দিন', 'Enter the right transaction ID'],
  senderPh: ['যে নম্বর থেকে পাঠালেন (ঐচ্ছিক)', 'The number you sent from (optional)'],
  changesLeft: ['আরও {n} বার বদলানো যাবে', 'You can change it {n} more times'],
  instructions: ['নির্দেশনা', 'INSTRUCTIONS'],
  copy: ['কপি', 'Copy'],
  verify: ['ভেরিফাই করুন', 'VERIFY TRANSACTION'],
  dupErr: [
    'এই ট্রান্সেকশন আইডি ইতিমধ্যে ব্যবহৃত হয়েছে',
    'This transaction ID has already been used',
  ],
  badShape: ['6 থেকে 20টি অক্ষর বা সংখ্যা দিন', 'Use 6 to 20 letters and digits'],
  badRef: ['ব্যাংকের রেফারেন্সটি ঠিক করে দিন', 'Check the bank reference'],
  badSender: ['মোবাইল নম্বরটি ঠিক করে দিন', 'Check the mobile number'],
  secured: ['এই পেজ কখনো PIN বা OTP চায় না', 'This page never asks for your PIN or OTP'],
  report: ['রিপোর্ট করুন', 'Report this page'],
  otherLanguage: ['English', 'বাংলা'],
  copiedNo: ['নম্বর কপি হয়েছে: {n}', 'Number copied: {n}'],
  reportedT: ['রিপোর্ট পাঠানো হয়েছে', 'Report sent'],
  help: ['সমস্যা হলে দোকানে যোগাযোগ করুন', 'Having trouble? Contact the shop'],
  call: ['কল করুন', 'Call'],
  back: ['ফিরে যান', 'Back'],
  close: ['বন্ধ করুন', 'Close'],
  test: ['টেস্ট পেমেন্ট: আসল টাকা কাটবে না।', 'Test payment: no real money moves.'],
  handT: ['{w}-এ নিয়ে যাওয়া হচ্ছে…', 'Taking you to {w}…'],
  handP: ['পেমেন্ট শেষ হলে এখানেই ফিরবেন।', 'You come back here when it is done.'],
  handGo: ['এগিয়ে যান', 'Continue'],
  gwCancelT: ['{w}-এ পেমেন্ট শেষ হয়নি', 'You did not finish on {w}'],
  gwFailT: ['{w} পেমেন্টটি নিতে পারেনি', '{w} could not take the payment'],
  gwP: [
    'আবার চেষ্টা করুন, অথবা নিজে টাকা পাঠিয়ে TrxID দিন।',
    'Try again, or send the money yourself and enter the TrxID.',
  ],
  gwRetry: ['আবার {w}-এ যান', 'Try {w} again'],
  gwHand: ['নিজে টাকা পাঠান', 'Send it yourself'],
  detailsT: ['অর্ডারের বিস্তারিত', 'Order details'],
  orderNo: ['অর্ডার নম্বর', 'Order number'],
  toPay: ['এখন পেমেন্ট', 'To pay now'],
  bankName: ['ব্যাংক', 'Bank'],
  acctName: ['অ্যাকাউন্টের নাম', 'Account name'],
  acctNo: ['অ্যাকাউন্ট নম্বর', 'Account number'],
  branch: ['শাখা', 'Branch'],
  routing: ['রাউটিং', 'Routing'],
  swift: ['SWIFT', 'SWIFT'],
  enterRef: ['ব্যাংকের রেফারেন্স দিন', 'Enter the bank reference'],
  bankStep1: ['এই অ্যাকাউন্টে {a} টাকা পাঠান:', 'Send {a} taka to this account:'],
  bankStep2: [
    'পাঠানোর পর উপরের বক্সে রেফারেন্স দিয়ে ভেরিফাই করুন।',
    'Then enter the reference in the box above and verify.',
  ],
  checkingT: ['SMS মেলানো হচ্ছে…', 'Matching the SMS…'],
  checkingP: [
    'সাধারণত 10 সেকেন্ড লাগে। এই পেজে থাকুন।',
    'Usually about 10 seconds. Stay on this page.',
  ],
  lateT: ['আমরা শিগগিরই কনফার্ম করব', 'We will confirm shortly'],
  lateP: [
    'এই পেজ বন্ধ করলেও হবে। কনফার্ম হলে আপনার অর্ডারের পেজে দেখতে পাবেন।',
    "You can close this page. Your order's page will show when it is confirmed.",
  ],
  manualT: ['দোকান চেক করে কনফার্ম করবে', 'The shop will check and confirm'],
  manualP: [
    'সাধারণত কিছুক্ষণের মধ্যে। এই পেজ বন্ধ করলেও হবে; কনফার্ম হলে আপনার অর্ডারের পেজে দেখতে পাবেন।',
    "Usually within a short while. You can close this page; your order's page will show when it is confirmed.",
  ],
  verifiedT: ['পেমেন্ট হয়েছে', 'Paid'],
  verifiedP: ['{s} সেকেন্ডে দোকানে ফিরছেন।', 'Returning to the shop in {s} seconds.'],
  verifiedDoneP: [
    'দোকান জেনে গেছে। আপনার আর কিছু করতে হবে না।',
    'The shop has been told. There is nothing more to do.',
  ],
  reviewT: ['টাকা মিলছে না', 'The amount did not match'],
  reviewP: [
    'যে টাকা এসেছে তা এই পেমেন্টের সাথে মিলছে না। দোকান দেখে জানাবে; আপনার এখন কিছু করতে হবে না।',
    'The money that arrived does not match this payment. The shop will check and let you know; nothing to do now.',
  ],
  reviewSenderT: ['নম্বর মিলছে না', 'The number did not match'],
  reviewSenderP: [
    'আপনার লেখা নম্বর থেকে এই টাকা আসেনি। দোকান দেখে জানাবে; আপনার এখন কিছু করতে হবে না।',
    'This money did not come from the number you entered. The shop will check and let you know; nothing to do now.',
  ],
  reviewOtherT: ['দোকান চেক করে জানাবে', 'The shop will check and let you know'],
  reviewOtherP: ['আপনার এখন কিছু করতে হবে না।', 'Nothing to do now.'],
  rejectedT: ['পেমেন্ট কনফার্ম হয়নি', 'Payment not confirmed'],
  rejectNoPay: [
    'এই TrxID-র টাকা দোকানের নম্বরে আসেনি।',
    "No money for this TrxID reached the shop's number.",
  ],
  rejectUsed: ['এই TrxID আগেই ব্যবহার করা হয়েছে।', 'This TrxID has already been used.'],
  rejectedNote: ['দোকান বলেছে: "{r}"', 'The shop said: "{r}"'],
  rejectedCancelled: ['তাই অর্ডারটি ক্যানসেল হয়েছে।', 'So the order was cancelled.'],
  rejectedLink: ['নতুন লিংকের জন্য দোকানে যোগাযোগ করুন।', 'Contact the shop for a new link.'],
  expiredT: ['সময় শেষ হয়ে গেছে', 'This payment link has expired'],
  expiredP: [
    'টাকা পাঠিয়ে থাকলে দোকানকে ট্রান্সজেকশন আইডি জানান। না পাঠিয়ে থাকলে দোকানে ফিরে আবার শুরু করুন।',
    'If you already sent the money, give the shop the transaction ID. If not, go back and start again.',
  ],
  paidT: ['এই পেমেন্ট আগেই হয়েছে', 'This payment was already made'],
  cancelledT: ['এই পেমেন্ট ক্যানসেল করা হয়েছে', 'This payment was cancelled'],
  cancelledP: ['নতুন করে অর্ডার করতে দোকানে ফিরুন।', 'Go back to the shop to order again.'],
  suspendedT: ['এই পেমেন্ট পেজ এখন বন্ধ আছে', 'This payment page is closed right now'],
  missingT: ['এই পেমেন্ট পেজ পাওয়া যায়নি', 'This payment page was not found'],
  missingP: [
    'লিংকটি ঠিক আছে কি না দেখুন, অথবা দোকানে যোগাযোগ করুন।',
    'Check the link, or contact the shop.',
  ],
  noMethodsT: [
    'এই দোকান এখন অনলাইনে পেমেন্ট নিচ্ছে না',
    'This shop is not taking online payments right now',
  ],
  busyT: ['একটু পরে আবার চেষ্টা করুন', 'Please try again in a moment'],
  busyP: ['অল্প সময়ে অনেকবার চেষ্টা হয়েছে।', 'There were too many tries in a short time.'],
  wrongT: ['কিছু একটা ঠিকমতো হয়নি', 'Something went wrong'],
  wrongP: ['একটু পরে পেজটি আবার খুলুন।', 'Please open this page again in a moment.'],
  amount: ['টাকা', 'Amount'],
  method: ['মেথড', 'Method'],
  trx: ['ট্রান্সজেকশন আইডি', 'Transaction ID'],
  time: ['সময়', 'Time'],
  backShop: ['দোকানে ফিরুন', 'BACK TO SHOP'],
  wrongTrx: ['TrxID বদলান', 'CHANGE TRANSACTION ID'],
  wrongTrxLink: ['TrxID ভুল দিয়েছেন? বদলান', 'Wrong TrxID? Change it'],
  reportTitle: ['এই পেজ রিপোর্ট করুন', 'Report this page'],
  reportWrongShop: ['এটা আমার অর্ডার করা দোকান নয়', 'This is not the shop I ordered from'],
  reportWrongAmount: ['টাকার পরিমাণ ভুল', 'The amount is wrong'],
  reportPin: ['PIN বা কোড চেয়েছে', 'It asked for my PIN or a code'],
  reportOther: ['অন্য কিছু', 'Something else'],
  reportNote: ['কী হয়েছে, এক লাইনে লিখুন', 'What happened, in a line'],
  reportNeedsNote: ['কী হয়েছে তা লিখুন', 'Please say what happened'],
  sendReport: ['রিপোর্ট পাঠান', 'Send report'],
} as const;

export type WordKey = keyof typeof WORDS;
export type PageLanguage = 'bn' | 'en';
export type PagePayee = 'shop' | 'lytro';

// PAYMENT-PAGE-DESIGN §8: the words that differ when a shop is paying Lytro. Everything else on the page reads the same.
const LYTRO_WORDS: Partial<Record<WordKey, readonly [string, string]>> = {
  orderRef: ['{o}', '{o}'],
  senderPh: ['যে নম্বর থেকে পাঠালেন', 'The number you sent from'],
  help: ['সমস্যা হলে Lytro সাপোর্টে যোগাযোগ করুন', 'Having trouble? Contact Lytro support'],
  detailsT: ['পেমেন্টের বিস্তারিত', 'Payment details'],
  orderNo: ['যেটার জন্য পেমেন্ট', 'Paying for'],
  lateP: [
    'এই পেজ বন্ধ করলেও হবে। কনফার্ম হলে ড্যাশবোর্ডে দেখতে পাবেন।',
    'You can close this page. Your dashboard will show when it is confirmed.',
  ],
  manualT: ['Lytro চেক করে কনফার্ম করবে', 'Lytro will check and confirm'],
  manualP: [
    'সাধারণত কিছুক্ষণের মধ্যে। এই পেজ বন্ধ করলেও হবে; কনফার্ম হলে ড্যাশবোর্ডে দেখতে পাবেন।',
    'Usually within a short while. You can close this page; your dashboard will show when it is confirmed.',
  ],
  verifiedP: ['{s} সেকেন্ডে ড্যাশবোর্ডে ফিরছেন।', 'Returning to your dashboard in {s} seconds.'],
  reviewP: [
    'যে টাকা এসেছে তা এই পেমেন্টের সাথে মিলছে না। Lytro দেখে জানাবে; আপনার এখন কিছু করতে হবে না।',
    'The money that arrived does not match this payment. Lytro will check and let you know; nothing to do now.',
  ],
  reviewSenderP: [
    'আপনার লেখা নম্বর থেকে এই টাকা আসেনি। Lytro দেখে জানাবে; আপনার এখন কিছু করতে হবে না।',
    'This money did not come from the number you entered. Lytro will check and let you know; nothing to do now.',
  ],
  reviewOtherT: ['Lytro চেক করে জানাবে', 'Lytro will check and let you know'],
  rejectedNote: ['Lytro বলেছে: "{r}"', 'Lytro said: "{r}"'],
  rejectedCancelled: ['বিলিং থেকে আবার পে করতে পারবেন।', 'You can pay again from Billing.'],
  expiredP: [
    'টাকা পাঠিয়ে থাকলে Lytro সাপোর্টকে ট্রান্সজেকশন আইডি জানান। না পাঠিয়ে থাকলে ড্যাশবোর্ডে ফিরে আবার শুরু করুন।',
    'If you already sent the money, give Lytro support the transaction ID. If not, go back to your dashboard and start again.',
  ],
  cancelledP: ['নতুন করে পে করতে ড্যাশবোর্ডে ফিরুন।', 'Go back to your dashboard to pay again.'],
  noMethodsT: [
    'Lytro এখন অনলাইনে পেমেন্ট নিচ্ছে না',
    'Lytro is not taking online payments right now',
  ],
  backShop: ['ড্যাশবোর্ডে ফিরুন', 'BACK TO DASHBOARD'],
};

/** The words in one language; a page has one for as long as it is being drawn. */
export class PageWords {
  constructor(
    readonly language: PageLanguage,
    private readonly payee: PagePayee = 'shop',
  ) {}

  of(key: WordKey, values: Readonly<Record<string, string | number>> = {}): string {
    const worded = (this.payee === 'lytro' ? LYTRO_WORDS[key] : undefined) ?? WORDS[key];
    const text: string = worded[this.language === 'bn' ? 0 : 1];
    return Object.entries(values).reduce(
      (filled, [name, value]) => filled.split(`{${name}}`).join(String(value)),
      text,
    );
  }

  /** A sentence the two languages build differently, as a wallet's steps are. */
  either<T>(bangla: T, english: T): T {
    return this.language === 'bn' ? bangla : english;
  }
}
