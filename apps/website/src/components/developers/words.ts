import type { Pair } from '@lytronix/validators/developer-api';

// lytro.app/developers' own words (SITE-PAGES-DESIGN §7), as the approved sketch writes them, Bangla first; a
// {placeholder} is filled live where the sketch drew a sample figure.
export const WORDS = {
  copy: ['কপি', 'Copy'],
  response: ['রেসপন্স', 'Response'],
  noParameters: ['কোনো প্যারামিটার নেই।', 'No parameters.'],
  parameters: ['প্যারামিটার', 'Parameters'],
  required: ['লাগবেই', 'Required'],
  optional: ['ঐচ্ছিক', 'Optional'],
  feedErrors: [
    'এই রুটে API কী-র এরর নেই; ভিজিটরের মিনিটের লিমিট আছে।',
    'No API key errors here; the visitor limit a minute still holds.',
  ],
  alsoEvery: [
    'সাথে সব রুটের কী, ওয়েবসাইট আর লিমিটের এরর:',
    'Plus the key, website and limit errors every route has:',
  ],
  errors: ['এরর', 'Errors'],
  worksPast: ['লিমিট শেষেও চলে', 'Works past the limit'],
  request: ['রিকোয়েস্ট', 'Request'],
  gettingStarted: ['শুরু করুন', 'Getting started'],
  authTitle: ['অথেন্টিকেশন ও হেডার', 'Authentication and headers'],
  limits: ['লিমিট', 'Limits'],
  startLead: [
    'Lytro API দিয়ে আপনার নিজের ওয়েবসাইট বা অ্যাপে আপনার Lytro শপের প্রোডাক্ট দেখাতে, ডেলিভারি চার্জ হিসাব করতে আর অর্ডার নিতে পারবেন। প্রতিটি অর্ডার সরাসরি আপনার ড্যাশবোর্ডের অর্ডারে আসে।',
    "With the Lytro API your own website or app can show your Lytro shop's products, work out delivery charges and take orders. Every order lands straight in your dashboard's Orders.",
  ],
  step1: ['একটি শপ খুলে API কী তৈরি করুন', 'Open a shop and make an API key'],
  step1Body: [
    'Lytro-তে ফ্রি শপ খুলুন। তারপর ড্যাশবোর্ডে সেটিংস → API কী → নতুন কী। কী-টি শুধু একবার দেখানো হয়, তাই তখনই কপি করে রাখুন। একসাথে সর্বোচ্চ 20টি কী চালু রাখা যায়।',
    'Open a free shop on Lytro. Then in the dashboard, Settings → API keys → New key. The key is shown once, so copy it then. Up to 20 can be live at a time.',
  ],
  step2: ['ওয়েবসাইটের ঠিকানা দিন', 'Add your website addresses'],
  step2Body: [
    'যে সাইট থেকে কী চলবে, কী-তে তার ঠিকানা দিন: https://, ডোমেইন আর দরকার হলে পোর্ট, পরে কোনো পাথ নয়। নিজের কম্পিউটারে টেস্টের জন্য http://localhost আর http://127.0.0.1 চলে। একটি কী-তে সর্বোচ্চ 10টি।',
    'Give the key the address of each site it runs on: https://, the domain and a port if needed, with no path after it. For testing on your own computer, http://localhost and http://127.0.0.1 work. Up to 10 a key.',
  ],
  step3: ['প্রথম রিকোয়েস্ট পাঠান', 'Send a first request'],
  step3Body: [
    'কী আর ঠিকানা ঠিক থাকলে এই রিকোয়েস্টে ক্যাটালগের ভার্সন আসবে।',
    'With the key and the address right, this answers with the catalogue version.',
  ],
  publicKey: ['এটা পাবলিক কী', 'This is a public key'],
  publicKeyBody: [
    'lytro_pk_ কী আপনার ওয়েবসাইটের কোডেই থাকে, তাই ব্রাউজারে যে কেউ এটা দেখতে পারে। অন্য কোনো ওয়েবসাইট ব্রাউজার থেকে এটা চালাতে পারে না, কারণ ব্রাউজার আসল Origin পাঠায়। আর এই কী দিয়ে শুধু এই পেজের কাজগুলোই হয়, যা আপনার সাইটের একজন কাস্টমারও করতে পারে: ক্যাটালগ দেখা, ডেলিভারি চার্জ, অর্ডার আর ট্র্যাকিং। আপনার অর্ডার লিস্ট, কাস্টমার বা টাকার হিসাব এই কী দিয়ে কখনো দেখা যায় না। ফাঁস হয়েছে মনে হলে নতুন কী বসিয়ে পুরোনোটা ক্যানসেল করুন।',
    "A lytro_pk_ key sits in your website's code, so anyone can see it in a browser. No other website can use it from a browser, because browsers send their real Origin. And it can only do what this page lists, which a shopper on your site can do anyway: read the catalogue, work out delivery, place and track an order. It never reads your orders list, customers or money. If you think it leaked, put a new key in and revoke the old one.",
  ],
  authLead: [
    'প্রতিটি রিকোয়েস্টে কী পাঠান Authorization হেডারে। কোন শপ, সেটা কী থেকেই বোঝা যায়; আলাদা করে শপের নাম পাঠাতে হয় না।',
    'Send the key in the Authorization header of every request. The key says which shop; you never send the shop yourself.',
  ],
  requestHeaders: ['রিকোয়েস্টের হেডার', 'Request headers'],
  responseHeaders: ['রেসপন্সের হেডার', 'Response headers'],
  envelope: ['উত্তরের খাম', 'The envelope'],
  envelopeBody: [
    'প্রতিটি JSON উত্তর একই খামে আসে: success, statusCode, message আর data; রিফিউজ হলে data-র বদলে errors। কী-তে দেওয়া ওয়েবসাইট রিফিউজের উত্তরও পড়তে পারে, তাই কেন হলো দেখা যায়।',
    'Every JSON answer comes in the same envelope: success, statusCode, message and data, or errors on a refusal. A website on the key can read even a refusal, so you can see why.',
  ],
  limitsLead: [
    'দুই রকম লিমিট: প্রতি মিনিটে, যাতে একজন ভিজিটর পুরো শপ আটকে দিতে না পারে; আর প্রতি বিলিং সাইকেলে, প্ল্যান অনুযায়ী। মিনিটের লিমিট পার হলে 429 আর Retry-After আসে।',
    'Two kinds: a minute, so one visitor can never hold up the whole shop; and a billing cycle, by plan. Past a minute limit you get 429 with Retry-After.',
  ],
  perCycle: [
    'প্রতি বিলিং সাইকেলে রিকোয়েস্ট, প্ল্যান অনুযায়ী',
    'Requests a billing cycle, by plan',
  ],
  paygRow: ['{free} ফ্রি, তারপর ৳{rate} / 1,000', '{free} free, then ৳{rate} / 1,000'],
  toldAt: [
    '50%, 80% আর 95%-এ শপের মালিককে জানানো হয়।',
    'The shop owner is told at 50%, 80% and 95%.',
  ],
  pastIt: [
    'লিমিট শেষ হলে বাকি রুটগুলো 429 RequestsUsedUp দেয়, কিন্তু অর্ডারের তিনটি রুট (/locations, /delivery-estimate, /orders) চলতেই থাকে: লিমিটের জন্য কোনো বিক্রি আটকায় না।',
    'Past it, the other routes answer 429 RequestsUsedUp, but the three an order needs (/locations, /delivery-estimate, /orders) keep working: a limit never turns a sale away.',
  ],
  packRaises: [
    'ড্যাশবোর্ডের Add-ons থেকে API রিকোয়েস্ট প্যাক কিনে লিমিট বাড়ানো যায়।',
    "An API request pack from the dashboard's Add-ons raises it.",
  ],
  paygTerms: [
    'পে-অ্যাজ-ইউ-গো: প্রতি সাইকেলে {free} সফল রিকোয়েস্ট (2xx আর 304) ফ্রি, তারপর প্রতি 1,000-এ ৳{rate}, প্রতি রাতে কাটা হয়, শপের নিজের ঠিক করা মাসের লিমিট পর্যন্ত (৳0 থেকে ৳{max})। রিকোয়েস্ট প্যাক নেই। লিমিট শেষ হলে বা ব্যালেন্স খালি হলে অর্ডারের তিনটি রুট ছাড়া বাকিগুলো 429 ApiCapReached দেয়।',
    "Pay-as-you-go: {free} successful requests (2xx and 304) free a cycle, then ৳{rate} per 1,000, charged each night, up to the month's limit the shop sets (৳0 to ৳{max}). No request packs. At the limit, or with an empty balance, every route but the three an order needs answers 429 ApiCapReached.",
  ],
  notCounted: [
    'শপের নিজের Lytro স্টোরফ্রন্টের রিকোয়েস্ট গোনা হয় না; ব্রাউজারে রেখে দেওয়া উত্তরও না।',
    "The shop's own Lytro storefront is not counted, nor is an answer a browser reuses from its cache.",
  ],
  errorsLead: [
    'রিফিউজ হলে success: false, আর errors.code বলে কী ধরনের সমস্যা। আপনার কোড statusCode আর errors.code দেখে সিদ্ধান্ত নেবে; message মানুষের পড়ার জন্য, আর Accept-Language অনুযায়ী ভাষা বদলায়।',
    'A refusal has success: false, and errors.code names the kind. Let your code decide by statusCode and errors.code; message is for people, and its language follows Accept-Language.',
  ],
  fieldsLead: [
    'কোনো ফিল্ড ভুল হলে প্রতিটির নাম, সমস্যা (problem) আর বার্তা আসে। ফর্মে ঠিক ফিল্ডের নিচে বার্তাটা দেখান।',
    'A wrong field comes back with its name, its problem and a message. Show the message under that field in your form.',
  ],
  checkedOrder: ['প্রতিটি রুটে, এই ক্রমে যাচাই', 'Checked on every route, in this order'],
  checkedOrderBody: [
    'কী → ওয়েবসাইট → শপ খোলা কিনা → মিনিটের লিমিট → সাইকেলের লিমিট। রিফিউজ হওয়া রিকোয়েস্ট গোনা হয় না।',
    'The key → the website → the shop open → the minute limit → the cycle limit. A refused request is not counted.',
  ],
  onThisPage: ['এই পেজে', 'On this page'],
  tocCount: ['4টি অংশ · {routes}টি রুট', '4 parts · {routes} routes'],
  crumb: ['ডেভেলপার', 'Developers'],
  heroLead: [
    'নিজের ওয়েবসাইট বা অ্যাপে Lytro শপের প্রোডাক্ট দেখান, ডেলিভারি চার্জ হিসাব করুন আর অর্ডার নিন। প্রতিটি রুটের রিকোয়েস্ট আর রেসপন্সের নমুনা, curl আর JavaScript-এ।',
    'Show your Lytro shop’s products on your own website or app, work out delivery charges and take orders. Every route with a sample request and response, in curl and JavaScript.',
  ],
  baseUrl: ['বেস URL', 'Base URL'],
  openShop: ['ফ্রি দোকান খুলুন', 'Open a free shop'],
  loginForKey: ['লগইন করে API কী নিন', 'Log in for your API key'],
  haveShop: ['শপ আছে: লগইন করুন', 'I have a shop: log in'],
  copied: ['কপি হয়েছে', 'Copied'],
  docsParts: ['ডকসের অংশ', 'Docs parts'],
} satisfies Record<string, Pair>;

export type WordKey = keyof typeof WORDS;
