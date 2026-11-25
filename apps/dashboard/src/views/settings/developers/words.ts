import type { Pair } from '@lytronix/validators/developer-api';

// Developer API's own words (TENANT-DASHBOARD-DESIGN §7.48), as the approved sketch writes them, Bangla first; a
// {placeholder} is filled with the shop's live figure where the sketch drew a sample one.
export const WORDS = {
  response: ['রেসপন্স', 'Response'],
  parameters: ['প্যারামিটার', 'Parameters'],
  required: ['লাগবেই', 'Required'],
  optional: ['ঐচ্ছিক', 'Optional'],
  noParameters: ['কোনো প্যারামিটার নেই।', 'No parameters.'],
  errors: ['এরর', 'Errors'],
  feedErrors: [
    'এই রুটে API কী-র এরর নেই; ভিজিটরের মিনিটের লিমিট আছে।',
    'No API key errors here; the visitor limit a minute still holds.',
  ],
  alsoEvery: [
    'সাথে সব রুটের কী, ওয়েবসাইট আর লিমিটের এরর:',
    'Plus the key, website and limit errors every route has:',
  ],
  worksPast: ['লিমিট শেষেও চলে', 'Works past the limit'],
  request: ['রিকোয়েস্ট', 'Request'],
  docsParts: ['ডকসের অংশ', 'Docs parts'],
  noKeyYet: [
    'আপনার নিজের ওয়েবসাইটের জন্য এখনও কোনো কী নেই। প্রথমে একটি তৈরি করুন।',
    'There is no key for your own website yet. Make one first.',
  ],
  liveKeys: ['আপনার {count}টি কী চালু আছে।', 'You have {count} live keys.'],
  seeApiKeys: ['API কী দেখুন', 'See API keys'],
  gettingStarted: ['শুরু করুন', 'Getting started'],
  startLead: [
    'Lytro API দিয়ে আপনার নিজের ওয়েবসাইট বা অ্যাপে এই শপের প্রোডাক্ট দেখাতে, ডেলিভারি চার্জ হিসাব করতে আর অর্ডার নিতে পারবেন। প্রতিটি অর্ডার সরাসরি এই ড্যাশবোর্ডের অর্ডারে আসে।',
    "With the Lytro API your own website or app can show this shop's products, work out delivery charges and take orders. Every order lands straight in this dashboard's Orders.",
  ],
  step1: ['একটি API কী তৈরি করুন', 'Make an API key'],
  step1Body: [
    'সেটিংস → API কী → নতুন কী। কী-টি শুধু একবার দেখানো হয়, তাই তখনই কপি করে রাখুন। একসাথে সর্বোচ্চ 20টি কী চালু রাখা যায়।',
    'Settings → API keys → New key. The key is shown once, so copy it then. Up to 20 can be live at a time.',
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
  authTitle: ['অথেন্টিকেশন ও হেডার', 'Authentication and headers'],
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
  paygRow: ['{free} ফ্রি, তারপর ৳{rate} / 1,000', '{free} free, then ৳{rate} / 1,000'],
  yourPlan: ['আপনার প্ল্যান', 'Your plan'],
  paygCharge: ['পে-অ্যাজ-ইউ-গো · এ মাসের API খরচ', "Pay-as-you-go · this month's API charge"],
  paygRequests: [
    '{requests} রিকোয়েস্ট: {free} ফ্রি, তারপর প্রতি 1,000-এ ৳{rate}, প্রতি রাতে কাটা হয়।',
    '{requests} requests: {free} free, then ৳{rate} per 1,000, charged each night.',
  ],
  paygLink: ['API খরচ ও লিমিট', 'API charge and limit'],
  thisCycle: ['এই সাইকেলে', 'this cycle'],
  seeUsage: ['ইউজেজ দেখুন', 'See usage'],
  buyPack: ['রিকোয়েস্ট প্যাক কিনুন', 'Buy a request pack'],
  paygCounted: [
    'শুধু সফল উত্তর (2xx আর 304) গোনা হয়; রিফিউজ বা এরর ফ্রি।',
    'Only successful answers (2xx and 304) count; a refusal or an error is free.',
  ],
  paygLimit: [
    'এ মাসের API খরচের লিমিট আপনি ঠিক করেন, ৳0 থেকে ৳{max} (শুরুতে ৳{start}); ৳0 মানে ফ্রি রিকোয়েস্টের পরে থামবে। 80%-এ অ্যাপে, পুশে আর ইমেইলে জানানো হয়।',
    "You set the month's API spending limit, ৳0 to ৳{max} (৳{start} to begin with); ৳0 stops at the free requests. You are told at 80%, in the app, by push and by email.",
  ],
  paygStop: [
    'লিমিট শেষ হলে বা ব্যালেন্স খালি হলে বাকি রুটগুলো 429 ApiCapReached দেয়, কিন্তু অর্ডারের তিনটি রুট (/locations, /delivery-estimate, /orders) চলতেই থাকে।',
    'At the limit, or with an empty balance, the other routes answer 429 ApiCapReached, but the three an order needs (/locations, /delivery-estimate, /orders) keep working.',
  ],
  paygNoPacks: ['পে-অ্যাজ-ইউ-গোতে রিকোয়েস্ট প্যাক নেই।', 'Pay-as-you-go has no request packs.'],
  notCounted: [
    'আপনার Lytro স্টোরফ্রন্টের ({address}) রিকোয়েস্ট গোনা হয় না; ব্রাউজারে রেখে দেওয়া উত্তরও না।',
    'Your Lytro storefront ({address}) is not counted, nor is an answer a browser reuses from its cache.',
  ],
  toldAt: ['50%, 80% আর 95%-এ আপনাকে জানানো হয়।', 'You are told at 50%, 80% and 95%.'],
  pastIt: [
    'লিমিট শেষ হলে বাকি রুটগুলো 429 RequestsUsedUp দেয়, কিন্তু অর্ডারের তিনটি রুট (/locations, /delivery-estimate, /orders) চলতেই থাকে: লিমিটের জন্য কোনো বিক্রি আটকায় না।',
    'Past it, the other routes answer 429 RequestsUsedUp, but the three an order needs (/locations, /delivery-estimate, /orders) keep working: a limit never turns a sale away.',
  ],
  packRaises: [
    'Add-ons থেকে API রিকোয়েস্ট প্যাক কিনে লিমিট বাড়ানো যায়।',
    'An API request pack from Add-ons raises it.',
  ],
  limits: ['লিমিট', 'Limits'],
  limitsLead: [
    'দুই রকম লিমিট: প্রতি মিনিটে, যাতে একজন ভিজিটর পুরো শপ আটকে দিতে না পারে; আর প্রতি বিলিং সাইকেলে, প্ল্যান অনুযায়ী। মিনিটের লিমিট পার হলে 429 আর Retry-After আসে।',
    'Two kinds: a minute, so one visitor can never hold up the whole shop; and a billing cycle, by plan. Past a minute limit you get 429 with Retry-After.',
  ],
  perCycle: ['প্রতি বিলিং সাইকেলে রিকোয়েস্ট', 'Requests a billing cycle'],
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
  lead: [
    'আপনার নিজের ওয়েবসাইট বা অ্যাপের জন্য Lytro API: প্রতিটি রুটের রিকোয়েস্ট আর রেসপন্সের নমুনা, curl আর JavaScript-এ।',
    'The Lytro API for your own website or app: every route with a sample request and response, in curl and JavaScript.',
  ],
  baseUrl: ['বেস URL', 'Base URL'],
  usedUp: [
    'এই সাইকেলের {limit} রিকোয়েস্ট শেষ। অর্ডারের রুটগুলো চলছে; বাকিগুলো 429 দিচ্ছে, পরের সাইকেলে আবার চালু হবে।',
    "This cycle's {limit} requests are used up. The order routes still work; the rest answer 429 until the next cycle.",
  ],
  capped: [
    'এ মাসের API খরচের লিমিট ৳{cap} শেষ। অর্ডারের রুটগুলো চলছে; বাকিগুলো 429 দিচ্ছে, লিমিট বাড়ালে বা পরের মাসে আবার চালু হবে।',
    "This month's API spending limit of ৳{cap} is reached. The order routes still work; the rest answer 429 until you raise the limit or the month turns.",
  ],
  raiseLimit: ['লিমিট বাড়ান', 'Raise the limit'],
  onThisPage: ['এই পেজে', 'On this page'],
  tocCount: ['4টি অংশ · {routes}টি রুট', '4 parts · {routes} routes'],
  entryTitle: ['ডেভেলপার ডকস', 'Developer docs'],
  entryBody: [
    'প্রতিটি রুটের রিকোয়েস্ট আর রেসপন্সের নমুনা, curl আর JavaScript-এ।',
    'Every route with a sample request and response, in curl and JavaScript.',
  ],
  noOwnKey: [
    'আপনার নিজের ওয়েবসাইট বা অ্যাপের জন্য এখনও কোনো কী নেই।',
    'No key yet for your own website or app.',
  ],
} satisfies Record<string, Pair>;

export type WordKey = keyof typeof WORDS;
