import type { MessageKey } from './message-key';
import type { Language } from '@lytronix/validators';

export type MessageParams = Record<string, string | number>;

type MessageText = string | ((params: MessageParams) => string);

const DICTIONARY: Record<MessageKey, { en: MessageText; bn: MessageText }> = {
  Success: { en: 'Success', bn: 'সফল হয়েছে' },
  Created: { en: 'Created', bn: 'তৈরি হয়েছে' },
  CheckHighlightedFields: {
    en: 'Check the highlighted fields.',
    bn: 'হাইলাইট করা ফিল্ডগুলো চেক করুন।',
  },
  SignInToContinue: { en: 'Sign in to continue.', bn: 'চালিয়ে যেতে লগইন করুন।' },
  RequestNotAccepted: { en: 'Request not accepted.', bn: 'রিকোয়েস্টটি গ্রহণ করা হয়নি।' },
  // §2.6: the framework's and the body parser's own rejections, worded for a person (malformed JSON, API-26).
  RequestNotReadable: {
    en: "We couldn't read the information sent. Please try again.",
    bn: 'পাঠানো তথ্য পড়া যায়নি। আবার ট্রাই করুন।',
  },
  RequestTooLarge: {
    en: 'Too much information was sent at once. Please send less and try again.',
    bn: 'একবারে অনেক বেশি তথ্য পাঠানো হয়েছে। কম করে আবার ট্রাই করুন।',
  },
  TooManyRequests: {
    en: 'Too many requests. Please wait a moment and try again.',
    bn: 'অনেক বেশি রিকোয়েস্ট এসেছে। একটু অপেক্ষা করে আবার ট্রাই করুন।',
  },
  CreateShopToContinue: {
    en: 'Create your shop to continue.',
    bn: 'চালিয়ে যেতে আপনার শপ তৈরি করুন।',
  },
  SetPasswordToContinue: {
    en: 'Set a password to continue.',
    bn: 'চালিয়ে যেতে একটি পাসওয়ার্ড সেট করুন।',
  },
  ShopUnavailable: {
    en: 'This shop is not available right now.',
    bn: 'এই শপটি এখন উপলব্ধ নয়।',
  },
  PermissionDenied: {
    en: 'You do not have permission for this.',
    bn: 'এটি করার অনুমতি আপনার নেই।',
  },
  PageNotFound: { en: 'Page not found.', bn: 'পেজটি খুঁজে পাওয়া যায়নি।' },
  SomethingWentWrong: {
    en: 'Something went wrong. Please try again.',
    bn: 'কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার ট্রাই করুন।',
  },
  SettingValueInvalid: {
    en: 'This value is not valid for this setting.',
    bn: 'এই সেটিংয়ের জন্য মানটি সঠিক নয়।',
  },
  PleaseTryAgain: { en: 'Please try again.', bn: 'অনুগ্রহ করে আবার ট্রাই করুন।' },
  IdempotencyKeyConflict: {
    en: 'This request key was already used with different data.',
    bn: 'এই রিকোয়েস্ট কী ইতিমধ্যে ভিন্ন ডেটার সাথে ব্যবহৃত হয়েছে।',
  },
  IdempotencyRequestInProgress: {
    en: 'The original request with this key is still being processed.',
    bn: 'এই কী দিয়ে মূল রিকোয়েস্টটি এখনও প্রসেস হচ্ছে।',
  },

  BalanceFrozen: { en: 'The balance is frozen.', bn: 'ব্যালেন্স ফ্রিজ করা আছে।' },
  InsufficientBalance: { en: 'Insufficient balance.', bn: 'পর্যাপ্ত ব্যালেন্স নেই।' },
  RateCannotBeNegative: { en: 'A rate cannot be negative.', bn: 'রেট নেগেটিভ হতে পারে না।' },
  UnknownRate: { en: 'Unknown rate.', bn: 'অজানা রেট।' },
  UnknownSetting: { en: 'Unknown setting.', bn: 'অজানা সেটিং।' },
  PlatformWalletNotFound: {
    en: 'Platform wallet not found.',
    bn: 'প্ল্যাটফর্ম ওয়ালেট পাওয়া যায়নি।',
  },

  BillingTermNotFound: { en: 'Billing term not found.', bn: 'বিলিং টার্মটি খুঁজে পাওয়া যায়নি।' },
  BillingTermInUse: {
    en: 'This term is priced for a plan. Retire it instead.',
    bn: 'এই টার্মটি একটি প্ল্যানের জন্য প্রাইস করা আছে। ডিলিট না করে রিটায়ার করুন।',
  },
  PlanNotFound: { en: 'Plan not found.', bn: 'প্ল্যানটি খুঁজে পাওয়া যায়নি।' },
  PlanRankTaken: {
    en: 'That rank is already used by a for-sale plan.',
    bn: 'এই র‍্যাংক আগে থেকেই সেলের জন্য উপলব্ধ একটি প্ল্যানে ব্যবহৃত আছে।',
  },
  PlanInUse: {
    en: 'This plan is in use. Retire it instead of deleting it.',
    bn: 'এই প্ল্যানটি ব্যবহৃত হচ্ছে। ডিলিট না করে রিটায়ার করুন।',
  },
  PriceNotFound: {
    en: 'No price is set for this plan and billing term.',
    bn: 'এই প্ল্যান এবং বিলিং মেয়াদের জন্য কোনো দাম নির্ধারিত নেই।',
  },
  InvoiceNotFound: { en: 'Invoice not found.', bn: 'ইনভয়েস পাওয়া যায়নি।' },
  PlanPaymentNotFound: { en: 'Payment not found.', bn: 'পেমেন্ট পাওয়া যায়নি।' },
  PlanPaymentNotPending: {
    en: 'This payment has already been reviewed.',
    bn: 'এই পেমেন্টটি ইতিমধ্যে পর্যালোচনা করা হয়েছে।',
  },
  TransactionIdAlreadyUsed: {
    en: 'This transaction ID has already been used.',
    bn: 'এই ট্রানজ্যাকশন আইডি ইতিমধ্যে ব্যবহৃত হয়েছে।',
  },
  TransactionIdRequired: {
    en: 'A transaction ID is required to approve this payment.',
    bn: 'এই পেমেন্ট অনুমোদনের জন্য একটি ট্রানজ্যাকশন আইডি প্রয়োজন।',
  },
  QuoteExpired: {
    en: 'This quote has expired. Please request a new one.',
    bn: 'এই কোটের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে নতুন একটি চান।',
  },
  AmountChanged: {
    en: (p) => `The amount is now ৳${String(p.amount)}. Check it and pay again.`,
    bn: (p) => `অ্যামাউন্ট এখন ৳${String(p.amount)}। দেখে নিয়ে আবার পেমেন্ট করুন।`,
  },
  PaymentClosed: {
    en: 'This payment request is closed, so it cannot take a transaction ID. Start the payment again; to keep money you already sent, add it to your balance with Top up.',
    bn: 'এই পেমেন্টের অনুরোধটা বন্ধ হয়ে গেছে, তাই এতে আর TrxID দেওয়া যাবে না। আবার পেমেন্ট শুরু করুন; যে টাকা পাঠিয়েছেন সেটা রাখতে টপ-আপ দিয়ে ব্যালেন্সে যোগ করুন।',
  },
  PaymentNotCancellable: {
    en: 'This payment cannot be cancelled: it was already sent for checking, or has been decided.',
    bn: 'এই পেমেন্টটা ক্যানসেল করা যাবে না: এটা চেক করতে পাঠানো হয়েছে, বা সিদ্ধান্ত হয়ে গেছে।',
  },
  AmountOutOfRange: {
    en: (p) => `Enter an amount between ${String(p.min)} and ${String(p.max)} TK.`,
    bn: (p) => `${String(p.min)} থেকে ${String(p.max)} টাকার মধ্যে একটি অ্যামাউন্ট দিন।`,
  },
  TopUpNotAvailable: {
    en: 'Top-up is not available in the shop’s current state.',
    bn: 'শপের বর্তমান অবস্থায় টপ-আপ উপলব্ধ নয়।',
  },
  UpgradeNotAvailable: {
    en: 'Upgrade is only available while your plan is active.',
    bn: 'আপগ্রেড শুধুমাত্র প্ল্যান চালু থাকলে উপলব্ধ।',
  },
  UpgradeMustBeHigherRank: {
    en: 'You can only upgrade to a higher plan.',
    bn: 'আপনি শুধুমাত্র উচ্চতর প্ল্যানে আপগ্রেড করতে পারবেন।',
  },
  UpgradePending: {
    en: 'An upgrade payment for this shop is still open. A new one can start once it is decided.',
    bn: 'এই শপের একটা আপগ্রেড পেমেন্ট এখনো খোলা আছে। সেটার সিদ্ধান্ত হলে নতুনটা শুরু করা যাবে।',
  },
  UpgradeNotWorthwhile: {
    en: 'The credit for your remaining days covers this plan and term. Please choose a longer term.',
    bn: 'আপনার বাকি দিনের ক্রেডিট এই প্ল্যান ও মেয়াদের দাম কভার করে। অনুগ্রহ করে দীর্ঘ মেয়াদ বেছে নিন।',
  },
  DowngradeNotAvailable: {
    en: 'Downgrade is only available while your plan is active.',
    bn: 'ডাউনগ্রেড শুধুমাত্র প্ল্যান চালু থাকলে উপলব্ধ।',
  },
  PayAsYouGoNotAvailable: {
    en: "This shop can't switch to pay-as-you-go right now.",
    bn: 'এই শপ এখন পে-অ্যাজ-ইউ-গো-তে যেতে পারবে না।',
  },
  CloseNotAvailable: {
    en: 'Only a pay-as-you-go shop can be closed. A shop on a plan stops at its period end when you cancel.',
    bn: 'শুধু পে-অ্যাজ-ইউ-গো শপ বন্ধ করা যায়। প্ল্যানে থাকা শপ ক্যানসেল করলে মেয়াদ শেষে বন্ধ হয়।',
  },
  DowngradeMustBeLowerRank: {
    en: 'You can only downgrade to a lower plan.',
    bn: 'আপনি শুধুমাত্র নিম্নতর প্ল্যানে ডাউনগ্রেড করতে পারবেন।',
  },
  ScheduledChangeNotFound: {
    en: 'No scheduled change was found for this shop.',
    bn: 'এই শপের জন্য কোনো নির্ধারিত পরিবর্তন পাওয়া যায়নি।',
  },
  AddonNotAvailable: {
    en: 'Add-ons can be bought while a paid plan is active.',
    bn: 'পেইড প্ল্যান চালু থাকলেই অ্যাড-অন কেনা যায়।',
  },
  AddonNotFound: {
    en: 'This add-on is not available.',
    bn: 'এই অ্যাড-অনটি পাওয়া যাচ্ছে না।',
  },
  AddonOnlyOne: {
    en: 'This add-on is bought one at a time.',
    bn: 'এই অ্যাড-অন একবারে একটিই কেনা যায়।',
  },
  AddonAlreadyActive: {
    en: 'Your shop already has this add-on.',
    bn: 'আপনার শপে এই অ্যাড-অন আগে থেকেই চালু আছে।',
  },
  AddonLimitUnlimited: {
    en: 'Your plan has no limit here, so this add-on is not needed.',
    bn: 'আপনার প্ল্যানে এখানে কোনো লিমিট নেই, তাই এই অ্যাড-অন লাগবে না।',
  },
  AddonKeyTaken: {
    en: 'Another add-on already uses this key.',
    bn: 'অন্য একটি অ্যাড-অন এই কী ব্যবহার করছে।',
  },
  AddonEnded: {
    en: 'This add-on has already ended.',
    bn: 'এই অ্যাড-অনের মেয়াদ শেষ হয়ে গেছে।',
  },

  FacebookSignInNotConfirmed: {
    en: 'Facebook did not confirm your sign-in.',
    bn: 'ফেসবুক আপনার লগইন কনফার্ম করেনি।',
  },
  GoogleSignInNotConfirmed: {
    en: 'Google did not confirm your sign-in.',
    bn: 'গুগল আপনার লগইন কনফার্ম করেনি।',
  },
  CodeAlreadyUsed: {
    en: 'This code has already been used.',
    bn: 'এই কোডটি আগেই ব্যবহার করা হয়েছে।',
  },
  CodeInvalid: {
    en: 'This code is not valid. Request a new one.',
    bn: 'এই কোডটি সঠিক নয়। নতুন একটি কোড নিন।',
  },
  CodeExpired: {
    en: 'This code has expired. Request a new one.',
    bn: 'এই কোডের মেয়াদ শেষ হয়ে গেছে। নতুন একটি কোড নিন।',
  },
  CodeIncorrect: { en: 'The code is not correct.', bn: 'কোডটি সঠিক নয়।' },
  CodeIncorrectTriesLeft: {
    en: (p) => {
      const left = Number(p.attemptsLeft);
      return `The code is not correct. You can try ${String(left)} more ${left === 1 ? 'time' : 'times'}.`;
    },
    bn: (p) => `কোডটি সঠিক নয়। আর ${String(p.attemptsLeft)} বার চেষ্টা করতে পারবেন।`,
  },
  TooManyWrongCodes: {
    en: 'Too many wrong codes. Wait before trying again.',
    bn: 'অনেকবার ভুল কোড দেওয়া হয়েছে। আবার চেষ্টা করার আগে অপেক্ষা করুন।',
  },
  IdentityKeepOneSignIn: {
    en: 'Keep at least one way to sign in.',
    bn: 'লগইন করার জন্য অন্তত একটি মাধ্যম রাখতে হবে।',
  },
  IdentityOwnsShop: {
    en: 'This identity owns your shop, so it cannot be removed.',
    bn: 'এই আইডেন্টিটি আপনার শপের মালিক, তাই এটি রিমুভ করা যাবে না।',
  },
  AccountCannotBeAdded: {
    en: 'This account cannot be added. Try another.',
    bn: 'এই অ্যাকাউন্টটি যুক্ত করা যাচ্ছে না। অন্য একটি ব্যবহার করুন।',
  },
  SignInLinkInvalid: {
    en: 'This sign-in link is not valid. Start again.',
    bn: 'এই লগইন লিংকটি সঠিক নয়। আবার শুরু করুন।',
  },
  CodeSentRecently: {
    en: 'A code was sent a moment ago. Wait before asking for another.',
    bn: 'কিছুক্ষণ আগেই একটি কোড পাঠানো হয়েছে। আবার চাওয়ার আগে অপেক্ষা করুন।',
  },
  TooManyCodesRequested: {
    en: 'Too many codes were requested for this destination. Try again later.',
    bn: 'এই নম্বর বা ইমেইলের জন্য অনেকবার কোড চাওয়া হয়েছে। পরে আবার ট্রাই করুন।',
  },
  CodeSendFailed: {
    en: 'We could not send your code. Try again in a minute.',
    bn: 'আপনার কোড পাঠানো যায়নি। এক মিনিট পর আবার ট্রাই করুন।',
  },
  PhoneOrPasswordWrong: {
    en: 'That phone number and password do not match.',
    bn: 'এই ফোন নম্বর ও পাসওয়ার্ড মিলছে না।',
  },
  CurrentPasswordWrong: {
    en: 'Your current password is not correct.',
    bn: 'আপনার কারেন্ট পাসওয়ার্ডটি সঠিক নয়।',
  },
  ShopAlreadyExists: {
    en: 'This account already has a shop.',
    bn: 'এই অ্যাকাউন্টের শপ আগে থেকেই আছে।',
  },
  AddressTaken: {
    en: 'That shop URL is taken. Try another one.',
    bn: 'এই লিংকটি আগে থেকেই নেওয়া আছে। অন্য একটি দিন।',
  },
  AddressTakenTry: {
    en: (p) => `That shop URL is taken. Try ${String(p.suggestion)}.`,
    bn: (p) => `এই লিংকটি আগে থেকেই নেওয়া আছে। ${String(p.suggestion)} চেষ্টা করুন।`,
  },
  AddressRequired: {
    en: 'Choose a URL for your shop.',
    bn: 'আপনার শপের জন্য একটি লিংক বেছে নিন।',
  },
  TooManyFailedSignins: {
    en: 'Too many failed sign-ins. Wait before trying again.',
    bn: 'অনেকবার লগইন করতে ব্যর্থ হয়েছে। আবার চেষ্টা করার আগে অপেক্ষা করুন।',
  },
  TooManySignups: {
    en: 'Too many sign-ups from this address. Try again later.',
    bn: 'এই অ্যাড্রেস থেকে অনেকবার সাইন-আপ করা হয়েছে। পরে আবার ট্রাই করুন।',
  },
  TooManyTrials: {
    en: 'Too many free trials. Try again later.',
    bn: 'অনেকবার ফ্রি ট্রায়াল নেওয়া হয়েছে। পরে আবার ট্রাই করুন।',
  },

  TwoFactorAlreadyEnrolled: {
    en: 'This account is already enrolled.',
    bn: 'এই অ্যাকাউন্ট আগে থেকেই এনরোল করা আছে।',
  },
  TwoFactorNeedsNewCode: {
    en: 'Sign in again to get a new code to scan.',
    bn: 'স্ক্যান করার জন্য নতুন কোড পেতে আবার লগইন করুন।',
  },
  TwoFactorIncomplete: {
    en: 'Finish 2FA enrollment first.',
    bn: 'প্রথমে 2FA এনরোলমেন্ট সম্পন্ন করুন।',
  },
  OperatorCredentialsWrong: {
    en: 'Incorrect email or password.',
    bn: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।',
  },
  BackupCodeInvalid: { en: 'That code is not valid.', bn: 'এই কোডটি সঠিক নয়।' },

  RoleHeldByMembers: {
    en: (p) => {
      const holders = Number(p.holders);
      return `This role is held by ${String(holders)} ${holders === 1 ? 'person' : 'people'}. Remove it from them first.`;
    },
    bn: (p) => `এই রোলটি ${String(p.holders)} জন ব্যবহার করছেন। প্রথমে তাদের থেকে এটি সরান।`,
  },
  RoleNameTaken: {
    en: 'A role with this name already exists.',
    bn: 'এই নামে একটি রোল আগে থেকেই আছে।',
  },
  RoleNotFound: { en: 'Role not found.', bn: 'রোলটি খুঁজে পাওয়া যায়নি।' },
  StaffPhoneBelongsToOwner: {
    en: 'That phone number belongs to a shop owner.',
    bn: 'এই ফোন নম্বরটি একজন শপ ওনারের।',
  },
  StaffPhoneInUse: {
    en: 'That phone number is already in use.',
    bn: 'এই ফোন নম্বরটি আগে থেকেই ব্যবহৃত হচ্ছে।',
  },
  StaffNotFound: { en: 'Staff member not found.', bn: 'স্টাফ মেম্বারকে খুঁজে পাওয়া যায়নি।' },
  OwnerCannotBeChanged: { en: 'The owner cannot be changed.', bn: 'ওনারকে পরিবর্তন করা যাবে না।' },
  RoleNotInShop: {
    en: 'One of the roles does not exist in this shop.',
    bn: 'এই রোলগুলোর একটি এই শপে নেই।',
  },
  SeatLimitReached: {
    en: (p) => {
      const seats = Number(p.seats);
      return `Your plan includes ${String(seats)} seat${seats === 1 ? '' : 's'}. Upgrade to add more staff.`;
    },
    bn: (p) => `আপনার প্ল্যানে ${String(p.seats)} টি সিট আছে। আরও স্টাফ যুক্ত করতে আপগ্রেড করুন।`,
  },
  PageLinkInvalid: { en: 'This page link is not valid.', bn: 'এই পেজ লিংকটি সঠিক নয়।' },
  StaffPasswordChangeWrongPath: {
    en: 'Only a staff member changes a staff password here.',
    bn: 'এখানে শুধু একজন স্টাফ মেম্বার তার পাসওয়ার্ড পরিবর্তন করতে পারবেন।',
  },
  OwnAccountNeedsOwnSignIn: {
    en: 'To change your own account, sign in with your own phone, email or Google, not the staff password.',
    bn: 'নিজের অ্যাকাউন্ট বদলাতে স্টাফ পাসওয়ার্ড নয়, নিজের ফোন, ইমেইল বা Google দিয়ে সাইন-ইন করুন।',
  },

  // --- Success ---
  CodeSent: { en: 'A verification code has been sent.', bn: 'একটি ভেরিফিকেশন কোড পাঠানো হয়েছে।' },
  SignedIn: { en: 'Signed in successfully.', bn: 'সফলভাবে লগইন হয়েছে।' },
  CodeVerified: { en: 'Code verified.', bn: 'কোড ভেরিফাই হয়েছে।' },
  PasswordSet: { en: 'Your password has been set.', bn: 'আপনার পাসওয়ার্ড সেট হয়েছে।' },
  PasswordChanged: {
    en: 'Your password has been changed.',
    bn: 'আপনার পাসওয়ার্ড পরিবর্তন হয়েছে।',
  },
  SignedOut: { en: 'Signed out successfully.', bn: 'সফলভাবে লগআউট হয়েছে।' },

  IdentitiesListed: { en: 'Identities retrieved.', bn: 'আইডেন্টিটিগুলো পাওয়া গেছে।' },
  IdentityAdded: {
    en: 'This sign-in method has been added.',
    bn: 'এই লগইন মাধ্যমটি যুক্ত হয়েছে।',
  },
  OauthRedirectReady: { en: 'Redirect ready.', bn: 'রিডাইরেক্ট তৈরি হয়েছে।' },
  IdentityRemoved: {
    en: 'This sign-in method has been removed.',
    bn: 'এই লগইন মাধ্যমটি রিমুভ হয়েছে।',
  },
  ProfileRetrieved: { en: 'Profile retrieved.', bn: 'প্রোফাইল পাওয়া গেছে।' },
  HomeRetrieved: { en: 'Home retrieved.', bn: 'হোম পাওয়া গেছে।' },
  LinkShareRecorded: { en: 'Link share recorded.', bn: 'লিংক শেয়ার করা হয়েছে।' },
  AddressChecked: { en: 'Address checked.', bn: 'ঠিকানা দেখা হয়েছে।' },
  OauthProvidersListed: { en: 'Sign-in options retrieved.', bn: 'লগইন অপশনগুলো পাওয়া গেছে।' },
  ShopCreated: { en: 'Shop created successfully.', bn: 'শপ সফলভাবে তৈরি হয়েছে।' },

  OperatorCredentialsAccepted: {
    en: 'Credentials accepted.',
    bn: 'ক্রেডেনশিয়াল গ্রহণ করা হয়েছে।',
  },
  TwoFactorEnrolled: {
    en: 'Two-factor authentication enrolled.',
    bn: 'টু-ফ্যাক্টর অথেনটিকেশন এনরোল হয়েছে।',
  },
  OperatorVerified: { en: 'Verified successfully.', bn: 'সফলভাবে ভেরিফাই হয়েছে।' },
  BackupCodesRegenerated: {
    en: 'New backup codes generated; the old ones no longer work.',
    bn: 'নতুন ব্যাকআপ কোড তৈরি হয়েছে; পুরনো কোডগুলো আর কাজ করবে না।',
  },

  ActivityListed: { en: 'Activity retrieved.', bn: 'অ্যাক্টিভিটি পাওয়া গেছে।' },
  BalanceRetrieved: { en: 'Balance retrieved.', bn: 'ব্যালেন্স পাওয়া গেছে।' },
  LedgerRetrieved: { en: 'Ledger retrieved.', bn: 'লেজার পাওয়া গেছে।' },
  RatesRetrieved: { en: 'Rates retrieved.', bn: 'রেট পাওয়া গেছে।' },
  EssentialSmsUsageRetrieved: {
    en: 'Essential SMS usage retrieved.',
    bn: 'জরুরি এসএমএস ব্যবহার পাওয়া গেছে।',
  },
  BalanceAdjusted: { en: 'Balance adjusted.', bn: 'ব্যালেন্স অ্যাডজাস্ট হয়েছে।' },

  BillingTermsListed: { en: 'Billing terms retrieved.', bn: 'বিলিং টার্মগুলো পাওয়া গেছে।' },
  BillingTermCreated: { en: 'Billing term created.', bn: 'বিলিং টার্ম তৈরি হয়েছে।' },
  BillingTermUpdated: { en: 'Billing term updated.', bn: 'বিলিং টার্ম আপডেট হয়েছে।' },
  BillingTermRetired: { en: 'Billing term retired.', bn: 'বিলিং টার্ম রিটায়ার হয়েছে।' },
  BillingTermDeleted: { en: 'Billing term deleted.', bn: 'বিলিং টার্ম ডিলিট হয়েছে।' },
  PlanPricesListed: { en: 'Plan prices retrieved.', bn: 'প্ল্যানের দাম পাওয়া গেছে।' },
  PlanPriceSet: { en: 'Plan price set.', bn: 'প্ল্যানের দাম সেট হয়েছে।' },
  PlanPriceRemoved: { en: 'Plan price removed.', bn: 'প্ল্যানের দাম রিমুভ হয়েছে।' },
  LimitOverridesListed: { en: 'Limit overrides retrieved.', bn: 'লিমিট ওভাররাইডগুলো পাওয়া গেছে।' },
  LimitOverrideSet: { en: 'Limit override set.', bn: 'লিমিট ওভাররাইড সেট হয়েছে।' },
  LimitOverrideRemoved: { en: 'Limit override removed.', bn: 'লিমিট ওভাররাইড রিমুভ হয়েছে।' },
  PlansListed: { en: 'Plans retrieved.', bn: 'প্ল্যানগুলো পাওয়া গেছে।' },
  PayAsYouGoPlanRetrieved: {
    en: 'Pay-as-you-go plan retrieved.',
    bn: 'পে-অ্যাজ-ইউ-গো প্ল্যান পাওয়া গেছে।',
  },
  PlanCreated: { en: 'Plan created.', bn: 'প্ল্যান তৈরি হয়েছে।' },
  PlanVersionsRetrieved: {
    en: 'Plan versions retrieved.',
    bn: 'প্ল্যানের ভার্সনগুলো পাওয়া গেছে।',
  },
  PlanUpdated: { en: 'Plan updated.', bn: 'প্ল্যান আপডেট হয়েছে।' },
  PlanDeleted: { en: 'Plan deleted.', bn: 'প্ল্যান ডিলিট হয়েছে।' },
  PlanAssigned: { en: 'Plan assigned.', bn: 'প্ল্যান অ্যাসাইন হয়েছে।' },
  RatesListed: { en: 'Rates retrieved.', bn: 'রেট পাওয়া গেছে।' },
  RateHistoryRetrieved: { en: 'Rate history retrieved.', bn: 'রেটের হিস্টরি পাওয়া গেছে।' },
  RateUpdated: { en: 'Rate updated.', bn: 'রেট আপডেট হয়েছে।' },
  PlatformWalletsListed: {
    en: 'Platform wallets retrieved.',
    bn: 'প্ল্যাটফর্ম ওয়ালেট পাওয়া গেছে।',
  },
  PlatformWalletAdded: { en: 'Platform wallet added.', bn: 'প্ল্যাটফর্ম ওয়ালেট যুক্ত হয়েছে।' },
  PlatformWalletUpdated: {
    en: 'Platform wallet updated.',
    bn: 'প্ল্যাটফর্ম ওয়ালেট আপডেট হয়েছে।',
  },
  PlatformWalletRemoved: {
    en: 'Platform wallet removed.',
    bn: 'প্ল্যাটফর্ম ওয়ালেট রিমুভ হয়েছে।',
  },
  SettingsListed: { en: 'Settings retrieved.', bn: 'সেটিংসগুলো পাওয়া গেছে।' },
  SettingUpdated: { en: 'Setting updated.', bn: 'সেটিং আপডেট হয়েছে।' },
  ShopSettingsRetrieved: { en: 'Shop settings retrieved.', bn: 'শপের সেটিংস পাওয়া গেছে।' },
  ShopSettingsUpdated: { en: 'Shop settings updated.', bn: 'শপের সেটিংস আপডেট হয়েছে।' },
  ExportRequested: { en: 'Export requested.', bn: 'এক্সপোর্ট রিকোয়েস্ট করা হয়েছে।' },
  ExportsListed: { en: 'Exports retrieved.', bn: 'এক্সপোর্টগুলো পাওয়া গেছে।' },
  ExportNotFound: { en: 'Export not found.', bn: 'এক্সপোর্ট পাওয়া যায়নি।' },
  ExportNotReady: { en: 'Export is not ready yet.', bn: 'এক্সপোর্ট এখনও প্রস্তুত নয়।' },
  ExportExpired: {
    en: 'This export link has expired.',
    bn: 'এই এক্সপোর্ট লিংকের মেয়াদ শেষ হয়ে গেছে।',
  },
  OwnerOnlyAction: {
    en: 'Only the shop owner can do this.',
    bn: 'শুধু শপের ওনার এটি করতে পারবেন।',
  },

  QuoteCreated: { en: 'Quote created.', bn: 'কোট তৈরি হয়েছে।' },
  PurchaseConfirmed: { en: 'Purchase confirmed.', bn: 'কেনা নিশ্চিত হয়েছে।' },
  TopUpQuoted: { en: 'Top-up quote created.', bn: 'টপ-আপ কোট তৈরি হয়েছে।' },
  TopUpConfirmed: { en: 'Top-up confirmed.', bn: 'টপ-আপ নিশ্চিত হয়েছে।' },
  InvoicesListed: { en: 'Invoices retrieved.', bn: 'ইনভয়েসগুলো পাওয়া গেছে।' },
  InvoiceRetrieved: { en: 'Invoice retrieved.', bn: 'ইনভয়েস পাওয়া গেছে।' },
  BillingPaymentsListed: { en: 'Payments retrieved.', bn: 'পেমেন্টগুলো পাওয়া গেছে।' },
  BillingPricesRetrieved: { en: 'Prices retrieved.', bn: 'দামগুলো পাওয়া গেছে।' },
  PaymentCancelled: { en: 'Payment cancelled.', bn: 'পেমেন্ট ক্যানসেল হয়েছে।' },
  PaymentQueueListed: { en: 'Payment queue retrieved.', bn: 'পেমেন্ট কিউ পাওয়া গেছে।' },
  PaymentApproved: { en: 'Payment approved.', bn: 'পেমেন্ট অনুমোদিত হয়েছে।' },
  PaymentRejected: { en: 'Payment rejected.', bn: 'পেমেন্ট রিজেক্ট হয়েছে।' },
  UpgradeQuoted: { en: 'Upgrade quote created.', bn: 'আপগ্রেড কোট তৈরি হয়েছে।' },
  UpgradeSubmitted: { en: 'Upgrade payment submitted.', bn: 'আপগ্রেড পেমেন্ট জমা দেওয়া হয়েছে।' },
  UpgradeConfirmed: { en: 'Upgrade confirmed.', bn: 'আপগ্রেড নিশ্চিত হয়েছে।' },
  AddonsListed: { en: 'Add-ons retrieved.', bn: 'অ্যাড-অনগুলো পাওয়া গেছে।' },
  AddonCreated: { en: 'Add-on created.', bn: 'অ্যাড-অন তৈরি হয়েছে।' },
  AddonUpdated: { en: 'Add-on updated.', bn: 'অ্যাড-অন আপডেট হয়েছে।' },
  AddonRetired: { en: 'Add-on retired.', bn: 'অ্যাড-অন বিক্রি বন্ধ হয়েছে।' },
  AddonQuoted: { en: 'Add-on quote created.', bn: 'অ্যাড-অন কোট তৈরি হয়েছে।' },
  AddonPurchased: { en: 'Add-on payment received.', bn: 'অ্যাড-অনের পেমেন্ট পাওয়া গেছে।' },
  AddonRenewalUpdated: {
    en: 'Add-on renewal updated.',
    bn: 'অ্যাড-অনের রিনিউ আপডেট হয়েছে।',
  },
  PackAutoBuyUpdated: { en: 'Auto-buy updated.', bn: 'অটো-বাই আপডেট হয়েছে।' },
  ShopAddonsRetrieved: {
    en: "Your shop's add-ons retrieved.",
    bn: 'আপনার শপের অ্যাড-অনগুলো পাওয়া গেছে।',
  },
  DowngradeScheduled: { en: 'Downgrade scheduled.', bn: 'ডাউনগ্রেড নির্ধারিত হয়েছে।' },
  PayAsYouGoChosen: { en: 'Pay-as-you-go chosen.', bn: 'পে-অ্যাজ-ইউ-গো বেছে নেওয়া হয়েছে।' },
  ShopClosed: { en: 'Shop closed.', bn: 'শপ বন্ধ করা হয়েছে।' },
  DowngradeCancelled: { en: 'Downgrade cancelled.', bn: 'ডাউনগ্রেড ক্যানসেল হয়েছে।' },
  DowngradePreviewed: { en: 'Downgrade preview retrieved.', bn: 'ডাউনগ্রেড প্রিভিউ পাওয়া গেছে।' },
  DowngradeRetrieved: { en: 'Scheduled change retrieved.', bn: 'নির্ধারিত পরিবর্তন পাওয়া গেছে।' },
  DowngradeChecklistRetrieved: {
    en: 'Downgrade checklist retrieved.',
    bn: 'ডাউনগ্রেডের চেকলিস্ট পাওয়া গেছে।',
  },
  SubscriptionCancelled: {
    en: 'Subscription cancelled, effective at period end.',
    bn: 'সাবস্ক্রিপশন ক্যানসেল হয়েছে, মেয়াদ শেষে কার্যকর হবে।',
  },
  SubscriptionCancellationUndone: {
    en: 'Cancellation undone.',
    bn: 'ক্যানসেল প্রত্যাহার করা হয়েছে।',
  },
  AutoRenewUpdated: {
    en: 'Auto-renew setting updated.',
    bn: 'অটো-রিনিউ সেটিং আপডেট হয়েছে।',
  },
  CancellationRetrieved: {
    en: 'Cancellation status retrieved.',
    bn: 'ক্যানসেলের অবস্থা পাওয়া গেছে।',
  },
  TenantsListed: { en: 'Tenants retrieved.', bn: 'টেন্যান্টগুলো পাওয়া গেছে।' },
  TenantSuspended: { en: 'Shop suspended.', bn: 'শপ সাসপেন্ড হয়েছে।' },
  TenantRestored: { en: 'Shop restored.', bn: 'শপ পুনরুদ্ধার হয়েছে।' },

  RolesListed: { en: 'Roles retrieved.', bn: 'রোলগুলো পাওয়া গেছে।' },
  RoleCreated: { en: 'Role created.', bn: 'রোল তৈরি হয়েছে।' },
  RoleUpdated: { en: 'Role updated.', bn: 'রোল আপডেট হয়েছে।' },
  RoleDeleted: { en: 'Role deleted.', bn: 'রোল ডিলিট হয়েছে।' },
  StaffListed: { en: 'Staff retrieved.', bn: 'স্টাফ লিস্ট পাওয়া গেছে।' },
  StaffCreated: { en: 'Staff member added.', bn: 'স্টাফ মেম্বার যুক্ত হয়েছে।' },
  StaffUpdated: { en: 'Staff member updated.', bn: 'স্টাফ মেম্বার আপডেট হয়েছে।' },
  StaffPasswordReset: { en: 'Staff password reset.', bn: 'স্টাফের পাসওয়ার্ড রিসেট হয়েছে।' },

  // --- Catalogue (Phase 3 Slice 1) ---
  ProductLimitReached: {
    en: (p) => {
      const products = Number(p.products);
      return `Your plan includes ${String(products)} product${products === 1 ? '' : 's'}. Archive one or upgrade to add more.`;
    },
    bn: (p) =>
      `আপনার প্ল্যানে ${String(p.products)}টি প্রোডাক্ট রাখা যায়। আরও যোগ করতে একটি আর্কাইভ করুন বা আপগ্রেড করুন।`,
  },
  ProductNotFound: {
    en: 'This product was not found.',
    bn: 'প্রোডাক্টটি পাওয়া যায়নি।',
  },
  CategoryNotFound: {
    en: 'This category was not found.',
    bn: 'ক্যাটাগরিটি পাওয়া যায়নি।',
  },
  AttributeNotFound: {
    en: 'This attribute was not found.',
    bn: 'অ্যাট্রিবিউটটি পাওয়া যায়নি।',
  },
  OptionNotFound: {
    en: 'This option was not found.',
    bn: 'অপশনটি পাওয়া যায়নি।',
  },
  CategoryHasProducts: {
    en: (p) => {
      const count = Number(p.count);
      return `${String(count)} product${count === 1 ? ' is' : 's are'} filed here. Move ${count === 1 ? 'it' : 'them'} to Uncategorized to delete the category.`;
    },
    bn: (p) =>
      `এই ক্যাটাগরিতে ${String(p.count)}টি প্রোডাক্ট আছে। ক্যাটাগরি ডিলিট করতে প্রোডাক্টগুলো ক্যাটাগরিহীন করে দিন।`,
  },
  CategoryHasChildren: {
    en: (p) => {
      const count = Number(p.count);
      return `This category has ${String(count)} sub-categor${count === 1 ? 'y' : 'ies'}. Move or delete ${count === 1 ? 'it' : 'them'} first.`;
    },
    bn: (p) =>
      `এই ক্যাটাগরির ভেতরে ${String(p.count)}টি সাব-ক্যাটাগরি আছে। আগে সেগুলো সরান বা ডিলিট করুন।`,
  },
  CategoryTooDeep: {
    en: (p) => `Categories go up to ${String(p.max)} levels deep. Choose a higher parent.`,
    bn: (p) =>
      `ক্যাটাগরি সর্বোচ্চ ${String(p.max)} ধাপ পর্যন্ত রাখা যায়। আরও উপরের একটি প্যারেন্ট বেছে নিন।`,
  },
  CategoryCannotMoveUnderItself: {
    en: 'A category cannot go under itself or one of its own sub-categories.',
    bn: 'কোনো ক্যাটাগরিকে তার নিজের বা নিজের সাব-ক্যাটাগরির ভেতরে রাখা যায় না।',
  },
  AttributeNameTaken: {
    en: 'An attribute with this name already exists. Use that one.',
    bn: 'এই নামে একটি অ্যাট্রিবিউট আগে থেকেই আছে। সেটাই ব্যবহার করুন।',
  },
  OptionValueTaken: {
    en: 'This option already exists. Use that one.',
    bn: 'এই অপশনটি আগে থেকেই আছে। সেটাই ব্যবহার করুন।',
  },
  AttributeHasNoOptions: {
    en: 'This kind of attribute has no options.',
    bn: 'এই ধরনের অ্যাট্রিবিউটের কোনো অপশন থাকে না।',
  },
  OptionValueNotANumber: {
    en: 'Enter a number greater than 0, with up to 4 decimals.',
    bn: '0-এর চেয়ে বড় একটি সংখ্যা দিন, দশমিকের পর সর্বোচ্চ 4 ঘর।',
  },
  AttributeCannotSplitVariants: {
    en: 'This attribute cannot make variants. Use one with a single choice per product, such as Size or Color.',
    bn: 'এই অ্যাট্রিবিউট দিয়ে ভ্যারিয়েন্ট বানানো যায় না। সাইজ বা কালারের মতো এক অপশনের অ্যাট্রিবিউট ব্যবহার করুন।',
  },
  AttributeAlreadyMakesVariants: {
    en: 'This attribute already makes the variants of this product.',
    bn: 'এই অ্যাট্রিবিউট দিয়ে এই প্রোডাক্টের ভ্যারিয়েন্ট তৈরি হচ্ছে।',
  },
  OptionNotOfAttribute: {
    en: "Choose one of this attribute's listed options.",
    bn: 'এই অ্যাট্রিবিউটের লিস্টের অপশনগুলো থেকে বেছে নিন।',
  },
  OneOptionPerAttribute: {
    en: 'Choose one option of each attribute.',
    bn: 'প্রতিটি অ্যাট্রিবিউট থেকে একটি করে অপশন বেছে নিন।',
  },
  VariantCombinationRepeated: {
    en: 'This combination is already a variant of this product.',
    bn: 'এই কম্বিনেশনটি এই প্রোডাক্টে আগে থেকেই একটি ভ্যারিয়েন্ট হিসেবে আছে।',
  },
  TooManyVariants: {
    en: (p) =>
      `A product has at most ${String(p.max)} variants. Use fewer options, or split it into separate products.`,
    bn: (p) =>
      `একটি প্রোডাক্টে সর্বোচ্চ ${String(p.max)}টি ভ্যারিয়েন্ট রাখা যায়। অপশন কমান, বা আলাদা প্রোডাক্ট বানান।`,
  },
  TooManyVariantAttributes: {
    en: (p) =>
      `A product's variants come from at most ${String(p.max)} attributes. Use fewer, or split it into separate products.`,
    bn: (p) =>
      `একটি প্রোডাক্টের ভ্যারিয়েন্ট সর্বোচ্চ ${String(p.max)}টি অ্যাট্রিবিউট দিয়ে বানানো যায়। কম ব্যবহার করুন, বা আলাদা প্রোডাক্ট বানান।`,
  },
  SkuTaken: {
    en: 'Another variant in your shop already has this SKU.',
    bn: 'আপনার শপের অন্য একটি ভ্যারিয়েন্টে এই SKU আগে থেকেই আছে।',
  },
  ProductSlugTaken: {
    en: 'Another product already uses this link. Choose another.',
    bn: 'অন্য একটি প্রোডাক্ট এই লিংক ব্যবহার করছে। অন্য একটি বেছে নিন।',
  },
  BusinessTypeUnknown: {
    en: 'Choose one of the listed shop types.',
    bn: 'লিস্টের শপের ধরনগুলো থেকে একটি বেছে নিন।',
  },
  AttributeValueWrongKind: {
    en: "This value doesn't fit the attribute's type.",
    bn: 'এই ভ্যালু অ্যাট্রিবিউটের টাইপের সাথে মেলে না।',
  },
  CapturedAttributeWrongType: {
    en: 'Only a text or number attribute can be filled in when ordering.',
    bn: 'শুধু টেক্সট বা সংখ্যার অ্যাট্রিবিউট অর্ডারের সময় পূরণ করা যায়।',
  },
  PresetNotFound: {
    en: 'This shop type was not found.',
    bn: 'শপের এই ধরনটি পাওয়া যায়নি।',
  },
  BatchOrSerialNotBoth: {
    en: 'Choose batch tracking or serial tracking, not both.',
    bn: 'ব্যাচ ট্র্যাকিং অথবা সিরিয়াল ট্র্যাকিং বেছে নিন, দুটো একসাথে নয়।',
  },
  OptionSetNameTaken: {
    en: 'An option set with this name already exists. Choose another name.',
    bn: 'এই নামে একটি অপশন সেট আগে থেকেই আছে। অন্য একটি নাম দিন।',
  },
  OptionSetNotFound: {
    en: 'This option set was not found.',
    bn: 'অপশন সেটটি পাওয়া যায়নি।',
  },
  LocationNotFound: {
    en: 'This thana was not found.',
    bn: 'থানাটি পাওয়া যায়নি।',
  },
  DeliveryAreaNotFound: {
    en: 'Choose an area from the list.',
    bn: 'লিস্ট থেকে একটি এলাকা বেছে নিন।',
  },
  DeliveryAreaTaken: {
    en: 'This area is already in another delivery zone. Remove it from there first.',
    bn: 'এই এলাকাটি অন্য একটি ডেলিভারি জোনে আছে। আগে সেখান থেকে সরান।',
  },
  DeliveryZoneNotFound: {
    en: 'This delivery zone was not found.',
    bn: 'ডেলিভারি জোনটি পাওয়া যায়নি।',
  },
  DeliveryZoneFixed: {
    en: 'The inside and outside zones are always there and cannot be deleted.',
    bn: 'ভেতরের আর বাইরের জোন সবসময় থাকে, ডিলিট করা যায় না।',
  },
  DeliveryZoneInUse: {
    en: 'Some products deliver only to this zone. Change their delivery zones first.',
    bn: 'কিছু প্রোডাক্ট শুধু এই জোনে ডেলিভারি হয়। আগে সেগুলোর ডেলিভারি জোন বদলান।',
  },
  TooManyDeliveryZones: {
    en: (p) =>
      `A shop has at most ${String(p.max)} delivery zones. Add the areas to a zone you already have.`,
    bn: (p) =>
      `একটি শপে সর্বোচ্চ ${String(p.max)}টি ডেলিভারি জোন রাখা যায়। এলাকাগুলো আগের কোনো জোনে যোগ করুন।`,
  },
  HomeZoneAreasAreHomeArea: {
    en: 'This zone covers your home area. Change the home area instead.',
    bn: 'এই জোনটি আপনার হোম এরিয়া। এর বদলে হোম এরিয়া বদলান।',
  },
  MadeToOrderHasNoStock: {
    en: 'A made-to-order product has no stock. Turn on stock tracking to enter it.',
    bn: 'মেড টু অর্ডার প্রোডাক্টের স্টক থাকে না। স্টক দিতে স্টক ট্র্যাকিং চালু করুন।',
  },
  WholeUnitsOnly: {
    en: 'This product is counted in whole units. Enter a whole number.',
    bn: 'এই প্রোডাক্ট পুরো সংখ্যায় গোনা হয়। একটি পূর্ণ সংখ্যা দিন।',
  },
  NotEnoughStock: {
    en: 'There is not enough stock for this change.',
    bn: 'এই পরিবর্তনের জন্য যথেষ্ট স্টক নেই।',
  },
  StockReasonDoesNotFit: {
    en: 'This reason does not fit the change. Choose another.',
    bn: 'এই কারণটি পরিবর্তনের সাথে মেলে না। অন্য একটি বেছে নিন।',
  },
  CostFromPurchases: {
    en: 'This cost now comes from your purchases, so it cannot be typed in.',
    bn: 'এই খরচ এখন আপনার কেনাকাটা থেকে হিসাব হয়, তাই হাতে লেখা যায় না।',
  },
  StockIsShared: {
    en: "This product's sizes share one stock. Change the shared stock instead.",
    bn: 'এই প্রোডাক্টের সাইজগুলো একটি স্টক শেয়ার করে। এর বদলে শেয়ার্ড স্টক বদলান।',
  },
  WholePacksOnly: {
    en: 'Sizes sharing one stock sell in whole packs. Enter a whole number.',
    bn: 'শেয়ার্ড স্টকের সাইজ পুরো প্যাকে বিক্রি হয়। একটি পূর্ণ সংখ্যা দিন।',
  },
  SharedStockNeedsEmpty: {
    en: 'Shared stock can be turned on or off only while the product holds no stock. Set its stock to 0 first.',
    bn: 'প্রোডাক্টে কোনো স্টক না থাকলেই শুধু শেয়ার্ড স্টক চালু বা বন্ধ করা যায়। আগে স্টক 0 করুন।',
  },
  BatchNotFound: {
    en: 'That batch was not found.',
    bn: 'ব্যাচটি পাওয়া যায়নি।',
  },
  BatchesNotTracked: {
    en: 'This product does not keep batches. Turn on batch tracking to give its stock a batch.',
    bn: 'এই প্রোডাক্টের ব্যাচ রাখা হয় না। স্টকের ব্যাচ দিতে ব্যাচ ট্র্যাকিং চালু করুন।',
  },
  NewBatchOnlyForArrivals: {
    en: 'A new batch is for stock arriving. To take stock away, choose the batch it leaves.',
    bn: 'নতুন ব্যাচ শুধু আসা স্টকের জন্য। স্টক কমাতে যে ব্যাচ থেকে যাচ্ছে সেটি বেছে নিন।',
  },
  ExpiryInThePast: {
    en: 'This expiry date has already passed. Check the date.',
    bn: 'এই এক্সপায়ারি ডেট পার হয়ে গেছে। তারিখটি দেখে নিন।',
  },
  BatchExpiryDiffers: {
    en: 'A batch with this code already has a different expiry date. One batch has one expiry date.',
    bn: 'এই কোডের ব্যাচের এক্সপায়ারি ডেট আলাদা। একটি ব্যাচের একটিই এক্সপায়ারি ডেট থাকে।',
  },
  BatchNotExpired: {
    en: 'This batch has not expired. Write off damaged or lost stock from the stock screen.',
    bn: 'এই ব্যাচটি এক্সপায়ার হয়নি। ড্যামেজ বা হারানো স্টক স্টক স্ক্রিন থেকে বাদ দিন।',
  },
  ExpiredStockAwaitsWriteOff: {
    en: 'Some expired stock is still waiting to be written off. Write it off before turning batches off.',
    bn: 'কিছু এক্সপায়ার্ড স্টক এখনো বাদ দেওয়া বাকি। ব্যাচ বন্ধ করার আগে সেটি বাদ দিন।',
  },
  SerialInvalid: {
    en: 'Use only letters, numbers and dashes, at most 64.',
    bn: 'শুধু অক্ষর, সংখ্যা আর ড্যাশ দিন, সর্বোচ্চ ৬৪টি।',
  },
  NotAnImei: {
    en: 'An IMEI is 15 digits.',
    bn: 'IMEI হয় ১৫ সংখ্যার।',
  },
  ImeiCheckDigitWrong: {
    en: 'This IMEI is not valid. Check its digits.',
    bn: 'এই IMEI সঠিক নয়। সংখ্যাগুলো দেখে নিন।',
  },
  SerialRepeated: {
    en: 'This serial number is listed twice.',
    bn: 'এই সিরিয়াল নম্বর দুইবার দেওয়া হয়েছে।',
  },
  SerialTaken: {
    en: 'A unit in your stock already has this serial number.',
    bn: 'আপনার স্টকের একটি ইউনিটের এই সিরিয়াল নম্বর আগে থেকেই আছে।',
  },
  SerialNotFound: {
    en: 'No unit of this item in stock has this serial number.',
    bn: 'স্টকে এই আইটেমের কোনো ইউনিটের এই সিরিয়াল নম্বর নেই।',
  },
  TooManySerials: {
    en: 'There are more serial numbers than units.',
    bn: 'ইউনিটের চেয়ে সিরিয়াল নম্বর বেশি দেওয়া হয়েছে।',
  },
  SerialsMustBeNamed: {
    en: 'Every unit here has a serial number. Say which ones are leaving.',
    bn: 'এখানের প্রতিটি ইউনিটের সিরিয়াল নম্বর আছে। কোনগুলো যাচ্ছে তা জানান।',
  },
  SerialsNotTracked: {
    en: 'This product does not keep serial numbers. Turn on serial tracking to enter them.',
    bn: 'এই প্রোডাক্টের সিরিয়াল নম্বর রাখা হয় না। দিতে সিরিয়াল ট্র্যাকিং চালু করুন।',
  },
  SerialsStillHeld: {
    en: 'Some units in stock still have serial numbers. Remove them before turning serial tracking off.',
    bn: 'স্টকের কিছু ইউনিটে এখনো সিরিয়াল নম্বর আছে। সিরিয়াল ট্র্যাকিং বন্ধ করার আগে সেগুলো সরান।',
  },
  SerialsNeedWholeUnits: {
    en: 'Serial numbers need a product counted in whole units.',
    bn: 'সিরিয়াল নম্বরের জন্য প্রোডাক্ট পুরো ইউনিটে গোনা হতে হবে।',
  },
  SerialHasLeft: {
    en: 'This unit has left your stock, so its serial number is kept as it was.',
    bn: 'এই ইউনিট স্টক থেকে চলে গেছে, তাই এর সিরিয়াল নম্বর আগের মতোই রাখা হয়েছে।',
  },
  StockCheckNotFound: {
    en: 'That stock check was not found.',
    bn: 'স্টক চেকটি পাওয়া যায়নি।',
  },
  PeriodEndsBeforeItStarts: {
    en: 'The start date is after the end date. Choose an earlier start.',
    bn: 'শুরুর তারিখ শেষের তারিখের পরে। আগের একটি তারিখ বেছে নিন।',
  },
  NotEnoughStockForOrder: {
    en: (p) => `There is not enough "${String(p.product)}" in stock for this order.`,
    bn: (p) => `এই অর্ডারের জন্য স্টকে যথেষ্ট "${String(p.product)}" নেই।`,
  },
  UnitsHeldForOrders: {
    en: 'Some units of this product are held for orders. Ship or cancel those orders first.',
    bn: 'এই প্রোডাক্টের কিছু ইউনিট অর্ডারের জন্য হোল্ড করা আছে। আগে সেই অর্ডারগুলো শিপ বা ক্যানসেল করুন।',
  },
  ComboPartNotFound: {
    en: 'Choose a variant of one of your products that is on sale.',
    bn: 'আপনার কোনো প্রোডাক্টের চালু একটা ভ্যারিয়েন্ট বেছে নিন।',
  },
  ComboInsideCombo: {
    en: 'A combo cannot be an item of another combo.',
    bn: 'একটা কম্বো আরেকটা কম্বোর আইটেম হতে পারে না।',
  },
  ComboPartTwice: {
    en: 'This variant is already in this item.',
    bn: 'এই ভ্যারিয়েন্ট এই আইটেমে আগেই আছে।',
  },
  ComboPartWhole: {
    en: 'Use a whole number: each unit is one piece, or one choice.',
    bn: 'পূর্ণ সংখ্যা দিন: প্রতি ইউনিট একটা পিস, বা একটা পছন্দ।',
  },
  ComboOnlyHasParts: { en: 'Only a combo has items.', bn: 'শুধু কম্বোর আইটেম থাকে।' },
  ComboHoldsNoStock: {
    en: 'A combo holds no stock of its own; its items do.',
    bn: 'কম্বোর নিজের কোনো স্টক নেই; এর আইটেমগুলোর স্টক থাকে।',
  },
  ComboHasOneVariant: {
    en: 'A combo has one variant; its choices are in its items.',
    bn: 'কম্বোর একটাই ভ্যারিয়েন্ট; পছন্দগুলো এর আইটেমে থাকে।',
  },
  ProductInCombos: {
    en: (p) => `This product is an item of ${String(p.combos)}. Remove it from them first.`,
    bn: (p) => `এই প্রোডাক্টটা ${String(p.combos)}-এর আইটেম। আগে সেখান থেকে সরান।`,
  },
  ComboChoiceNeeded: {
    en: (p) => `Choose a variant for each unit of "${String(p.combo)}".`,
    bn: (p) => `"${String(p.combo)}"-এর প্রতিটা ইউনিটের জন্য একটা ভ্যারিয়েন্ট বেছে নিন।`,
  },
  ComboChoiceNotOffered: {
    en: 'This variant is not one of the choices, or is not on sale.',
    bn: 'এই ভ্যারিয়েন্ট পছন্দের মধ্যে নেই, বা এখন বিক্রি হচ্ছে না।',
  },
  ComboCannotBeMade: {
    en: (p) => `"${String(p.combo)}" cannot be made now.`,
    bn: (p) => `"${String(p.combo)}" এখন বানানো যাচ্ছে না।`,
  },
  NotEnoughStockForCombo: {
    en: (p) => `Not enough stock to make "${String(p.combo)}".`,
    bn: (p) => `"${String(p.combo)}" বানানোর মতো স্টক নেই।`,
  },
  ComboComponentNotOnLine: {
    en: 'This item is not in the combo on this line.',
    bn: 'এই আইটেম এই লাইনের কম্বোতে নেই।',
  },
  ComboReturnsWhole: {
    en: 'A combo comes back whole: count the combos, and name any damaged item.',
    bn: 'কম্বো পুরোটাই ফেরত আসে: কয়টা কম্বো তা লিখুন, আর কোনো আইটেম নষ্ট হলে তা জানান।',
  },
  ReservationNotFound: {
    en: 'That stock hold was not found.',
    bn: 'স্টক হোল্ডটি পাওয়া যায়নি।',
  },
  ReservationResolved: {
    en: 'This stock hold has already been shipped or released.',
    bn: 'এই স্টক হোল্ড আগেই শিপ বা রিলিজ করা হয়েছে।',
  },
  SerialPerUnitShipped: {
    en: 'Give the serial number of every unit being shipped.',
    bn: 'শিপ করা প্রতিটি ইউনিটের সিরিয়াল নম্বর দিন।',
  },
  ReservedStockExpired: {
    en: 'Some units held for this order have expired, so it cannot ship as it is.',
    bn: 'এই অর্ডারের জন্য হোল্ড করা কিছু ইউনিট এক্সপায়ার হয়ে গেছে, তাই এভাবে শিপ করা যাবে না।',
  },
  NothingReturned: {
    en: 'Mark at least one returned unit as sellable or damaged.',
    bn: 'অন্তত একটি রিটার্ন ইউনিট বিক্রয়যোগ্য বা ড্যামেজ হিসেবে চিহ্নিত করুন।',
  },
  ReservationNotShipped: {
    en: 'This order has not shipped, so nothing can come back. Release its stock instead.',
    bn: 'এই অর্ডার এখনো শিপ হয়নি, তাই রিটার্ন নেওয়া যাবে না। এর বদলে স্টক রিলিজ করুন।',
  },
  MoreThanShipped: {
    en: 'That is more than was shipped and has not come back yet.',
    bn: 'এটি শিপ হওয়া এবং এখনো রিটার্ন না আসা পরিমাণের চেয়ে বেশি।',
  },
  SerialPerUnitReturned: {
    en: 'Give the serial number of every unit returned.',
    bn: 'রিটার্ন আসা প্রতিটি ইউনিটের সিরিয়াল নম্বর দিন।',
  },
  ReturnCannotRestock: {
    en: 'This product is no longer kept in stock, so the return cannot go back into stock.',
    bn: 'এই প্রোডাক্ট আর স্টকে রাখা হয় না, তাই রিটার্ন আসা ইউনিট স্টকে নেওয়া যাবে না।',
  },
  ApiKeyMissing: {
    en: 'Send your API key as "Authorization: Bearer <key>".',
    bn: 'আপনার API কী "Authorization: Bearer <key>" হিসেবে পাঠান।',
  },
  ApiKeyInvalid: {
    en: 'This API key is not valid. Check it, or make a new one in the dashboard.',
    bn: 'এই API কী সঠিক নয়। কী-টি দেখে নিন, অথবা ড্যাশবোর্ড থেকে নতুন একটি তৈরি করুন।',
  },
  ApiKeyWasRevoked: {
    en: 'This API key was revoked. Use another key, or make a new one in the dashboard.',
    bn: 'এই API কী ক্যানসেল করা হয়েছে। অন্য কী ব্যবহার করুন, অথবা ড্যাশবোর্ড থেকে নতুন একটি তৈরি করুন।',
  },
  ApiKeyExpired: {
    en: 'This API key has expired. Make a new one in the dashboard.',
    bn: 'এই API কী-র মেয়াদ শেষ হয়ে গেছে। ড্যাশবোর্ড থেকে নতুন একটি তৈরি করুন।',
  },
  WebsiteNotRegistered: {
    en: "This website is not one of this API key's website addresses. Add it to the key in the dashboard.",
    bn: 'এই ওয়েবসাইট এই API কী-র ওয়েবসাইট তালিকায় নেই। ড্যাশবোর্ডে কী-টিতে এটি যোগ করুন।',
  },
  RequestsUsedUp: {
    en: 'This shop has used all its API requests for this billing period. They start again with the next one.',
    bn: 'এই শপ এই বিলিং পিরিয়ডের সব API রিকোয়েস্ট ব্যবহার করে ফেলেছে। পরের পিরিয়ডে আবার শুরু হবে।',
  },
  ApiKeyNotFound: {
    en: 'That API key was not found.',
    bn: 'API কী-টি পাওয়া যায়নি।',
  },
  TooManyApiKeys: {
    en: (p) =>
      `A shop holds at most ${String(p.max)} API keys at once. Revoke one you no longer use first.`,
    bn: (p) =>
      `একটি শপে একসাথে সর্বোচ্চ ${String(p.max)}টি API কী রাখা যায়। আগে অব্যবহৃত একটি ক্যানসেল করুন।`,
  },
  ApiKeyExpiryInPast: {
    en: 'This date has already passed. Choose a later one, or leave it empty for a key that never expires.',
    bn: 'এই তারিখ পার হয়ে গেছে। পরের একটি তারিখ বেছে নিন, অথবা মেয়াদহীন কী-র জন্য খালি রাখুন।',
  },
  SupplierNotFound: {
    en: 'That supplier was not found.',
    bn: 'সাপ্লায়ারটি পাওয়া যায়নি।',
  },
  SupplierNameTaken: {
    en: 'You already have a supplier with this name. Use that one, or choose another name.',
    bn: 'এই নামে আপনার একটি সাপ্লায়ার আগে থেকেই আছে। সেটি ব্যবহার করুন, অথবা অন্য নাম দিন।',
  },
  SupplierArchived: {
    en: 'This supplier is archived. Bring it back first, or choose another supplier.',
    bn: 'এই সাপ্লায়ার আর্কাইভ করা আছে। আগে ফিরিয়ে আনুন, অথবা অন্য সাপ্লায়ার বেছে নিন।',
  },
  PurchaseNotFound: {
    en: 'That purchase was not found.',
    bn: 'পারচেজটি পাওয়া যায়নি।',
  },
  PurchaseAlreadyPlaced: {
    en: 'This purchase has already been placed with the supplier.',
    bn: 'এই পারচেজ আগেই সাপ্লায়ারকে দেওয়া হয়েছে।',
  },
  PurchaseIsDraft: {
    en: 'This purchase is still a draft and has not been placed. Delete the draft instead.',
    bn: 'এই পারচেজ এখনো ড্রাফট, সাপ্লায়ারকে দেওয়া হয়নি। এর বদলে ড্রাফটটি ডিলিট করুন।',
  },
  PurchasePlacedIsKept: {
    en: 'A placed purchase is kept on record. Cancel it instead.',
    bn: 'দেওয়া পারচেজ রেকর্ডে থেকে যায়। এর বদলে এটি ক্যানসেল করুন।',
  },
  PurchaseHasDeliveries: {
    en: 'Stock has been received on this purchase, so only its expected date and notes can change.',
    bn: 'এই পারচেজে স্টক রিসিভ হয়েছে, তাই শুধু আসার তারিখ আর নোট বদলানো যায়।',
  },
  PurchaseCloseShortInstead: {
    en: 'Stock has been received on this purchase, so it cannot be cancelled. Close it short instead.',
    bn: 'এই পারচেজে স্টক রিসিভ হয়েছে, তাই এটি ক্যানসেল করা যায় না। এর বদলে বাকিটা ক্লোজ করুন।',
  },
  PurchaseFinished: {
    en: 'This purchase is finished and can no longer change.',
    bn: 'এই পারচেজ শেষ হয়ে গেছে, এটি আর বদলানো যায় না।',
  },
  VariantRetired: {
    en: 'This variant is no longer sold, so it cannot be bought.',
    bn: 'এই ভ্যারিয়েন্ট আর বিক্রি হয় না, তাই এটি কেনা যায় না।',
  },
  PlaceBeforeReceiving: {
    en: 'This purchase is still a draft. Place it with the supplier before receiving it.',
    bn: 'এই পারচেজ এখনো ড্রাফট। রিসিভ করার আগে এটি সাপ্লায়ারকে দিন।',
  },
  PurchaseItemNotFound: {
    en: 'That item is not on this purchase.',
    bn: 'এই আইটেমটি এই পারচেজে নেই।',
  },
  PurchaseItemChanged: {
    en: 'This product has changed since the purchase was placed, so it cannot be received. Close the purchase short instead.',
    bn: 'পারচেজ দেওয়ার পর এই প্রোডাক্ট বদলে গেছে, তাই এটি রিসিভ করা যায় না। এর বদলে পারচেজের বাকিটা ক্লোজ করুন।',
  },
  MoreThanOutstanding: {
    en: 'That is more than is still to come on this item.',
    bn: 'এই আইটেমে যতটা আসা বাকি, এটা তার চেয়ে বেশি।',
  },
  NothingAccepted: {
    en: 'Nothing is accepted on this item, so it has no batch or serial numbers.',
    bn: 'এই আইটেমে কিছুই অ্যাকসেপ্ট করা হয়নি, তাই এর কোনো ব্যাচ বা সিরিয়াল নম্বর নেই।',
  },
  NothingReceivedCancelInstead: {
    en: 'Nothing has been received on this purchase yet. Cancel it instead.',
    bn: 'এই পারচেজে এখনো কিছু রিসিভ হয়নি। এর বদলে এটি ক্যানসেল করুন।',
  },
  FallbackZoneHasNoAreas: {
    en: 'This zone covers every area no other zone has, so it has no areas of its own.',
    bn: 'অন্য কোনো জোনে না থাকা সব এলাকা এই জোনে পড়ে, তাই এর আলাদা এলাকা নেই।',
  },
  PresetsListed: {
    en: 'Shop types retrieved.',
    bn: 'শপের ধরনগুলো পাওয়া গেছে।',
  },
  ProductDefaultsRetrieved: {
    en: 'Product defaults retrieved.',
    bn: 'প্রোডাক্টের ডিফল্ট পাওয়া গেছে।',
  },
  BusinessTypeSaved: {
    en: 'Shop type saved.',
    bn: 'শপের ধরন সেভ হয়েছে।',
  },
  AttributesListed: {
    en: 'Attributes retrieved.',
    bn: 'অ্যাট্রিবিউট পাওয়া গেছে।',
  },
  AttributeCreated: {
    en: 'Attribute added.',
    bn: 'অ্যাট্রিবিউট যোগ হয়েছে।',
  },
  AttributeUpdated: {
    en: 'Attribute updated.',
    bn: 'অ্যাট্রিবিউট আপডেট হয়েছে।',
  },
  OptionCreated: {
    en: 'Option added.',
    bn: 'অপশন যোগ হয়েছে।',
  },
  OptionUpdated: {
    en: 'Option updated.',
    bn: 'অপশন আপডেট হয়েছে।',
  },
  CategoriesListed: {
    en: 'Categories retrieved.',
    bn: 'ক্যাটাগরি পাওয়া গেছে।',
  },
  CategoryCreated: {
    en: 'Category added.',
    bn: 'ক্যাটাগরি যোগ হয়েছে।',
  },
  CategoryUpdated: {
    en: 'Category updated.',
    bn: 'ক্যাটাগরি আপডেট হয়েছে।',
  },
  CategoryDeleted: {
    en: 'Category deleted.',
    bn: 'ক্যাটাগরি ডিলিট হয়েছে।',
  },
  CategorySuggestionsSaved: {
    en: 'Suggested attributes saved.',
    bn: 'সাজেস্টেড অ্যাট্রিবিউট সেভ হয়েছে।',
  },
  ProductsListed: {
    en: 'Products retrieved.',
    bn: 'প্রোডাক্ট পাওয়া গেছে।',
  },
  ProductRetrieved: {
    en: 'Product retrieved.',
    bn: 'প্রোডাক্ট পাওয়া গেছে।',
  },
  ProductCreated: {
    en: 'Product added.',
    bn: 'প্রোডাক্ট যোগ হয়েছে।',
  },
  ProductUpdated: {
    en: 'Product updated.',
    bn: 'প্রোডাক্ট আপডেট হয়েছে।',
  },
  ProductVariantsSaved: {
    en: 'Variants saved.',
    bn: 'ভ্যারিয়েন্ট সেভ হয়েছে।',
  },
  ProductAttributesSaved: {
    en: 'Attributes saved.',
    bn: 'অ্যাট্রিবিউট সেভ হয়েছে।',
  },
  ProductSlugChanged: {
    en: 'Product link changed. The old link still works.',
    bn: 'প্রোডাক্ট লিংক বদলানো হয়েছে। আগের লিংকটিও কাজ করবে।',
  },
  ProductDeleted: {
    en: 'Product deleted.',
    bn: 'প্রোডাক্ট ডিলিট হয়েছে।',
  },
  ProductDuplicated: {
    en: 'Product copied. The copy stays hidden until you turn it on.',
    bn: 'প্রোডাক্ট কপি হয়েছে। চালু না করা পর্যন্ত কপিটি শপে দেখাবে না।',
  },
  ProductRestored: {
    en: 'Product restored. It is back in the list.',
    bn: 'প্রোডাক্ট ফিরিয়ে আনা হয়েছে। এটা আবার লিস্টে আছে।',
  },
  SizeChartSaved: {
    en: 'Size chart saved.',
    bn: 'সাইজ চার্ট সেভ হয়েছে।',
  },
  SizeChartRemoved: {
    en: 'Size chart removed.',
    bn: 'সাইজ চার্ট সরানো হয়েছে।',
  },
  OptionsAdded: {
    en: 'Options added.',
    bn: 'অপশন যোগ হয়েছে।',
  },
  OptionSetsListed: {
    en: 'Option sets retrieved.',
    bn: 'অপশন সেট পাওয়া গেছে।',
  },
  OptionSetCreated: {
    en: 'Option set saved.',
    bn: 'অপশন সেট সেভ হয়েছে।',
  },
  OptionSetUpdated: {
    en: 'Option set updated.',
    bn: 'অপশন সেট আপডেট হয়েছে।',
  },
  OptionSetDeleted: {
    en: 'Option set deleted.',
    bn: 'অপশন সেট ডিলিট হয়েছে।',
  },
  PresetUpdated: {
    en: 'Shop type updated.',
    bn: 'শপের ধরন আপডেট হয়েছে।',
  },
  LocationsListed: {
    en: 'Districts and thanas retrieved.',
    bn: 'জেলা ও থানার লিস্ট পাওয়া গেছে।',
  },
  DeliveryZonesListed: {
    en: 'Delivery zones retrieved.',
    bn: 'ডেলিভারি জোন পাওয়া গেছে।',
  },
  DeliveryZoneCreated: {
    en: 'Delivery zone added.',
    bn: 'ডেলিভারি জোন যোগ হয়েছে।',
  },
  DeliveryZoneUpdated: {
    en: 'Delivery zone updated.',
    bn: 'ডেলিভারি জোন আপডেট হয়েছে।',
  },
  DeliveryZoneDeleted: {
    en: 'Delivery zone deleted.',
    bn: 'ডেলিভারি জোন ডিলিট হয়েছে।',
  },
  HomeAreaSaved: {
    en: 'Home area saved.',
    bn: 'হোম এরিয়া সেভ হয়েছে।',
  },
  DeliveryZoneResolved: {
    en: 'Delivery zone found.',
    bn: 'ডেলিভারি জোন পাওয়া গেছে।',
  },
  ProductDeliveryZonesSaved: {
    en: 'Delivery zones saved for this product.',
    bn: 'এই প্রোডাক্টের ডেলিভারি জোন সেভ হয়েছে।',
  },
  StockRetrieved: {
    en: 'Stock retrieved.',
    bn: 'স্টক পাওয়া গেছে।',
  },
  StockSaved: {
    en: 'Stock saved.',
    bn: 'স্টক সেভ হয়েছে।',
  },
  VariantCostSaved: {
    en: 'Cost saved.',
    bn: 'কেনা দাম সেভ হয়েছে।',
  },
  StockHistoryRetrieved: {
    en: 'Stock history retrieved.',
    bn: 'স্টকের হিস্টরি পাওয়া গেছে।',
  },
  StockCheckSaved: {
    en: 'Stock check saved.',
    bn: 'স্টক চেক সেভ হয়েছে।',
  },
  StockChecksRetrieved: {
    en: 'Stock checks retrieved.',
    bn: 'স্টক চেকগুলো পাওয়া গেছে।',
  },
  StockCheckRetrieved: {
    en: 'Stock check retrieved.',
    bn: 'স্টক চেক পাওয়া গেছে।',
  },
  StockAdded: {
    en: 'Stock added.',
    bn: 'স্টক যোগ হয়েছে।',
  },
  BatchesRetrieved: {
    en: 'Batches retrieved.',
    bn: 'ব্যাচগুলো পাওয়া গেছে।',
  },
  BatchWrittenOff: {
    en: 'Expired stock written off.',
    bn: 'এক্সপায়ার্ড স্টক বাদ দেওয়া হয়েছে।',
  },
  SerialsRetrieved: {
    en: 'Serial numbers retrieved.',
    bn: 'সিরিয়াল নম্বরগুলো পাওয়া গেছে।',
  },
  SerialsAdded: {
    en: 'Serial numbers added.',
    bn: 'সিরিয়াল নম্বর যোগ হয়েছে।',
  },
  SerialsChecked: {
    en: 'Serial numbers checked.',
    bn: 'সিরিয়াল নম্বর মিলিয়ে দেখা হয়েছে।',
  },
  SerialCorrected: {
    en: 'Serial number corrected.',
    bn: 'সিরিয়াল নম্বর ঠিক করা হয়েছে।',
  },
  SerialRemoved: {
    en: 'Serial number removed.',
    bn: 'সিরিয়াল নম্বর সরানো হয়েছে।',
  },
  SuppliersRetrieved: {
    en: 'Suppliers retrieved.',
    bn: 'সাপ্লায়ারগুলো পাওয়া গেছে।',
  },
  SupplierRetrieved: {
    en: 'Supplier retrieved.',
    bn: 'সাপ্লায়ার পাওয়া গেছে।',
  },
  SupplierCreated: {
    en: 'Supplier added.',
    bn: 'সাপ্লায়ার যোগ হয়েছে।',
  },
  ApiKeysListed: {
    en: 'API keys retrieved.',
    bn: 'API কী-গুলো পাওয়া গেছে।',
  },
  ApiKeyCreated: {
    en: 'API key made. Copy it now: it is shown only this once.',
    bn: 'API কী তৈরি হয়েছে। এখনই কপি করে রাখুন: এটি শুধু এই একবারই দেখানো হবে।',
  },
  ApiKeyUpdated: {
    en: 'API key saved.',
    bn: 'API কী সেভ হয়েছে।',
  },
  ApiKeyRevoked: {
    en: 'API key revoked. It stops working within a few seconds.',
    bn: 'API কী ক্যানসেল হয়েছে। কয়েক সেকেন্ডের মধ্যে এটি কাজ করা বন্ধ করবে।',
  },
  AdTrackingRetrieved: { en: 'Ad tracking retrieved.', bn: 'অ্যাড ট্র্যাকিং পাওয়া গেছে।' },
  AdTrackingSaved: { en: 'Ad tracking saved.', bn: 'অ্যাড ট্র্যাকিং সেভ হয়েছে।' },
  AdTrackingRemoved: { en: 'Ad tracking removed.', bn: 'অ্যাড ট্র্যাকিং রিমুভ হয়েছে।' },
  CatalogFeedRetrieved: {
    en: 'Catalog feed link retrieved.',
    bn: 'ক্যাটালগ ফিড লিংক পাওয়া গেছে।',
  },
  CatalogFeedRegenerated: {
    en: 'New catalog feed link made. The old link no longer works.',
    bn: 'নতুন ক্যাটালগ ফিড লিংক তৈরি হয়েছে। পুরনো লিংক আর কাজ করবে না।',
  },
  CatalogFeedUnreadable: {
    en: 'This feed link can no longer be shown. Make a new one; the old one keeps working until you do.',
    bn: 'এই ফিড লিংকটি আর দেখানো যাচ্ছে না। নতুন একটি লিংক তৈরি করুন; তার আগ পর্যন্ত পুরনো লিংক কাজ করবে।',
  },
  ShopRetrieved: {
    en: 'Shop retrieved.',
    bn: 'শপের তথ্য পাওয়া গেছে।',
  },
  CatalogueVersionRetrieved: {
    en: 'Catalogue version retrieved.',
    bn: 'ক্যাটালগ ভার্সন পাওয়া গেছে।',
  },
  SupplierUpdated: {
    en: 'Supplier saved.',
    bn: 'সাপ্লায়ার সেভ হয়েছে।',
  },
  PurchaseOrdersRetrieved: {
    en: 'Purchases retrieved.',
    bn: 'পারচেজগুলো পাওয়া গেছে।',
  },
  PurchaseOrderRetrieved: {
    en: 'Purchase retrieved.',
    bn: 'পারচেজ পাওয়া গেছে।',
  },
  PurchaseOrderCreated: {
    en: 'Purchase saved as a draft.',
    bn: 'পারচেজ ড্রাফট হিসেবে সেভ হয়েছে।',
  },
  PurchaseOrderUpdated: {
    en: 'Purchase saved.',
    bn: 'পারচেজ সেভ হয়েছে।',
  },
  PurchaseOrderPlaced: {
    en: 'Purchase placed with the supplier.',
    bn: 'পারচেজ সাপ্লায়ারকে দেওয়া হয়েছে।',
  },
  PurchaseOrderCancelled: {
    en: 'Purchase cancelled.',
    bn: 'পারচেজ ক্যানসেল করা হয়েছে।',
  },
  PurchaseOrderDeleted: {
    en: 'Draft deleted.',
    bn: 'ড্রাফট ডিলিট করা হয়েছে।',
  },
  PurchaseReceived: {
    en: 'Delivery received.',
    bn: 'ডেলিভারি রিসিভ করা হয়েছে।',
  },
  PurchaseClosedShort: {
    en: 'Purchase closed; the rest will not come.',
    bn: 'পারচেজ ক্লোজ করা হয়েছে; বাকিটা আর আসবে না।',
  },
  PurchaseHistoryRetrieved: {
    en: 'Purchase history retrieved.',
    bn: 'পারচেজ হিস্টরি পাওয়া গেছে।',
  },
  InventoryFiguresRetrieved: {
    en: 'Inventory report retrieved.',
    bn: 'ইনভেন্টরি রিপোর্ট পাওয়া গেছে।',
  },

  // --- Media (Phase 3 Slice 6) ---
  MediaNotFound: {
    en: 'This photo or video was not found.',
    bn: 'ছবি বা ভিডিওটি পাওয়া যায়নি।',
  },
  ImageTooLarge: {
    en: (p) => `An image can be up to ${String(p.mb)} MB.`,
    bn: (p) => `ছবি সর্বোচ্চ ${String(p.mb)} MB হতে পারে।`,
  },
  VideoTooLarge: {
    en: (p) => `A video can be up to ${String(p.mb)} MB.`,
    bn: (p) => `ভিডিও সর্বোচ্চ ${String(p.mb)} MB হতে পারে।`,
  },
  StorageLimitReached: {
    en: (p) =>
      `Your plan includes ${String(p.mb)} MB of storage, and this file would go over it. Delete photos you no longer use, or upgrade.`,
    bn: (p) =>
      `আপনার প্ল্যানে ${String(p.mb)} MB স্টোরেজ আছে, এই ফাইলে তা ছাড়িয়ে যাবে। অপ্রয়োজনীয় ছবি ডিলিট করুন বা আপগ্রেড করুন।`,
  },
  StorageUnavailable: {
    en: 'Photo storage is not reachable right now. Please try again in a minute.',
    bn: 'এই মুহূর্তে ছবির স্টোরেজে পৌঁছানো যাচ্ছে না। এক মিনিট পরে আবার ট্রাই করুন।',
  },
  MediaNotAttachable: {
    en: 'Choose a photo that has finished uploading.',
    bn: 'আপলোড শেষ হয়েছে এমন একটি ছবি বেছে নিন।',
  },
  UploadStarted: { en: 'Upload started.', bn: 'আপলোড শুরু হয়েছে।' },
  UploadFinished: {
    en: 'Upload received; the photo is being prepared.',
    bn: 'আপলোড পাওয়া গেছে; ছবিটি রেডি করা হচ্ছে।',
  },
  MediaListed: { en: 'Media retrieved.', bn: 'মিডিয়া পাওয়া গেছে।' },
  MediaRetrieved: { en: 'Media item retrieved.', bn: 'মিডিয়া আইটেম পাওয়া গেছে।' },
  StorageUsageRetrieved: {
    en: 'Storage use retrieved.',
    bn: 'স্টোরেজের ব্যবহার পাওয়া গেছে।',
  },
  BandwidthRetrieved: {
    en: 'Bandwidth use retrieved.',
    bn: 'ব্যান্ডউইথের ব্যবহার পাওয়া গেছে।',
  },
  UsageRetrieved: { en: 'Usage retrieved.', bn: 'ব্যবহার পাওয়া গেছে।' },
  MediaDeleted: { en: 'Deleted from your media.', bn: 'মিডিয়া থেকে ডিলিট করা হয়েছে।' },
  ProductImagesSaved: { en: 'Product photos saved.', bn: 'প্রোডাক্টের ছবি সেভ হয়েছে।' },
  ShopLogoSaved: { en: 'Logo saved.', bn: 'লোগো সেভ হয়েছে।' },
  ProductVideoSaved: { en: 'Product video saved.', bn: 'প্রোডাক্টের ভিডিও সেভ হয়েছে।' },
  BrandRetrieved: { en: 'Brand identity loaded.', bn: 'ব্র্যান্ড আইডেন্টিটি লোড হয়েছে।' },
  BrandSaved: { en: 'Brand identity saved.', bn: 'ব্র্যান্ড আইডেন্টিটি সেভ হয়েছে।' },
  BrandNeedsAddon: {
    en: 'Buy the brand identity add-on to switch your brand on.',
    bn: 'ব্র্যান্ড চালু করতে ব্র্যান্ড আইডেন্টিটি অ্যাড-অন কিনুন।',
  },
  BrandContrastLow: {
    en: (p) =>
      `Not enough contrast: ${String(p.ratio)}:1, and ${String(p.needs)}:1 is needed. Try ${String(p.suggestion)}.`,
    bn: (p) =>
      `কনট্রাস্ট কম: ${String(p.ratio)}:1, লাগবে ${String(p.needs)}:1। ${String(p.suggestion)} দিয়ে দেখুন।`,
  },
  BrandIconNotSquare: {
    en: (p) => `Choose a square image at least ${String(p.min)} px wide for the icon.`,
    bn: (p) => `আইকনের জন্য অন্তত ${String(p.min)} px-এর একটা চৌকো ছবি দিন।`,
  },
  OrderNotFound: {
    en: 'That order was not found.',
    bn: 'অর্ডারটি পাওয়া যায়নি।',
  },
  OrderIsCancelled: {
    en: 'This order is cancelled, so it can no longer be changed.',
    bn: 'এই অর্ডারটি ক্যানসেল করা হয়েছে, তাই আর বদলানো যাবে না।',
  },
  OrderHasShipped: {
    en: 'This order has shipped, so its details and items can no longer be changed.',
    bn: 'এই অর্ডারটি শিপ হয়ে গেছে, তাই এর তথ্য বা আইটেম আর বদলানো যাবে না।',
  },
  OrderShippedReturnInstead: {
    en: 'This order has shipped, so it cannot be cancelled. Record a return instead.',
    bn: 'এই অর্ডারটি শিপ হয়ে গেছে, তাই ক্যানসেল করা যাবে না। এর বদলে রিটার্ন নিন।',
  },
  OrderCannotBeDeleted: {
    en: 'This order has shipped or been paid, so it cannot be deleted. Cancel it or record a return instead.',
    bn: 'এই অর্ডারটি শিপ বা পেমেন্ট হয়ে গেছে, তাই ডিলিট করা যাবে না। এর বদলে ক্যানসেল করুন বা রিটার্ন নিন।',
  },
  OrderItemNotFound: {
    en: 'That item is not on this order.',
    bn: 'এই আইটেমটি এই অর্ডারে নেই।',
  },
  OrderItemChanged: {
    en: 'An item already on the order keeps its product and option. Remove it and add the new one instead.',
    bn: 'অর্ডারে থাকা আইটেমের প্রোডাক্ট বা অপশন বদলানো যায় না। এটি সরিয়ে নতুনটি যোগ করুন।',
  },
  NotAskedWhenOrdering: {
    en: 'This product does not ask for this when ordering.',
    bn: 'অর্ডারের সময় এই প্রোডাক্টে এটা জানতে চাওয়া হয় না।',
  },
  CallBackInPast: {
    en: 'Choose a time later than now.',
    bn: 'এখনকার পরের একটা সময় বেছে নিন।',
  },
  IdempotencyKeyRequired: {
    en: 'Send an Idempotency-Key header with this request, so sending it again never makes it twice.',
    bn: 'এই রিকোয়েস্টের সাথে একটি Idempotency-Key হেডার পাঠান, যাতে আবার পাঠালেও দুবার তৈরি না হয়।',
  },
  VariantSplitFixed: {
    en: 'This product has orders, so the attributes that make its options can no longer change. Create a new product instead.',
    bn: 'এই প্রোডাক্টে অর্ডার আছে, তাই এর অপশন তৈরির অ্যাট্রিবিউট আর বদলানো যাবে না। এর বদলে নতুন প্রোডাক্ট তৈরি করুন।',
  },
  OrderCreated: {
    en: 'Order created.',
    bn: 'অর্ডার তৈরি হয়েছে।',
  },
  OrderPriced: {
    en: 'Order priced.',
    bn: 'অর্ডারের দাম হিসাব হয়েছে।',
  },
  OrdersRetrieved: {
    en: 'Orders retrieved.',
    bn: 'অর্ডারগুলো পাওয়া গেছে।',
  },
  OrderRetrieved: {
    en: 'Order retrieved.',
    bn: 'অর্ডার পাওয়া গেছে।',
  },
  OrderUpdated: {
    en: 'Order updated.',
    bn: 'অর্ডার আপডেট হয়েছে।',
  },
  OrderCallSaved: {
    en: 'Call saved.',
    bn: 'কল সেভ হয়েছে।',
  },
  OrderCancelled: {
    en: 'Order cancelled.',
    bn: 'অর্ডার ক্যানসেল হয়েছে।',
  },
  OrderStatusSet: {
    en: 'Order status updated.',
    bn: 'অর্ডারের স্ট্যাটাস আপডেট হয়েছে।',
  },
  OrderDeleted: {
    en: 'Order deleted.',
    bn: 'অর্ডার ডিলিট হয়েছে।',
  },
  ApiKeyManagedByLytro: {
    en: 'Lytro keeps this key for your storefront, so it cannot be changed or revoked.',
    bn: 'এই কী Lytro আপনার স্টোরফ্রন্টের জন্য রাখে, তাই এটা বদলানো বা ক্যানসেল করা যায় না।',
  },
  DeliveryEstimated: {
    en: 'Delivery charge worked out.',
    bn: 'ডেলিভারি চার্জ হিসাব হয়েছে।',
  },
  DomainRetrieved: { en: 'Domain loaded.', bn: 'ডোমেইন লোড হয়েছে।' },
  DomainAdded: {
    en: 'Domain added. Add its records where you bought it.',
    bn: 'ডোমেইন যোগ হয়েছে। ডোমেইন যেখান থেকে কিনেছেন, সেখানে রেকর্ডগুলো যোগ করুন।',
  },
  DomainChecked: { en: 'Domain checked.', bn: 'ডোমেইন চেক করা হয়েছে।' },
  DomainRemoved: { en: 'Domain removed.', bn: 'ডোমেইন সরানো হয়েছে।' },
  DomainNeedsPlan: {
    en: 'Growth and Pro plans include your own domain.',
    bn: 'Growth আর Pro প্ল্যানে নিজের ডোমেইন থাকে।',
  },
  DomainFormat: { en: 'Enter a domain like megh.com.', bn: 'megh.com-এর মতো একটা ডোমেইন লিখুন।' },
  DomainIsLytro: {
    en: 'This is a Lytro address. Enter a domain you bought.',
    bn: 'এটা Lytro-র ঠিকানা। আপনার কেনা ডোমেইন লিখুন।',
  },
  DomainTaken: {
    en: 'This domain is active on another shop.',
    bn: 'এই ডোমেইন আরেকটা শপে চালু আছে।',
  },
  DomainAlreadySet: {
    en: 'Your shop already has a domain. Remove it to add another.',
    bn: 'আপনার শপে আগে থেকেই একটা ডোমেইন আছে। আরেকটা যোগ করতে আগেরটা সরিয়ে দিন।',
  },
  DomainNotSet: { en: 'Your shop has no domain yet.', bn: 'আপনার শপে এখনো কোনো ডোমেইন নেই।' },
  TooManyOrders: {
    en: 'Too many orders in a short time. Wait a minute and try again.',
    bn: 'অল্প সময়ে অনেক অর্ডার এসেছে। এক মিনিট পর আবার ট্রাই করুন।',
  },
  ProductNotOnSale: {
    en: (p) => `"${String(p.product)}" is not on sale right now.`,
    bn: (p) => `"${String(p.product)}" এখন বিক্রি হচ্ছে না।`,
  },
  ProductNeedsAdvance: {
    en: (p) =>
      `"${String(p.product)}" needs an advance payment, which cannot be paid here yet. Contact the shop to order it.`,
    bn: (p) =>
      `"${String(p.product)}"-এর জন্য অ্যাডভান্স পেমেন্ট লাগে, যা এখানে এখনো দেওয়া যায় না। অর্ডার করতে শপের সাথে যোগাযোগ করুন।`,
  },
  ShopDoesNotDeliverHere: {
    en: 'This shop does not deliver to this area.',
    bn: 'এই শপ এই এরিয়াতে ডেলিভারি দেয় না।',
  },
  ProductNotDeliveredHere: {
    en: (p) => `"${String(p.product)}" cannot be delivered to this area.`,
    bn: (p) => `"${String(p.product)}" এই এরিয়াতে ডেলিভারি হয় না।`,
  },
  OrderTracked: {
    en: 'Order found.',
    bn: 'অর্ডার পাওয়া গেছে।',
  },
  OrderNotShipped: {
    en: 'This order has not shipped yet.',
    bn: 'এই অর্ডার এখনো শিপ হয়নি।',
  },
  OrderAlreadySent: {
    en: 'This order has already left the shop.',
    bn: 'এই অর্ডার আগেই শপ থেকে চলে গেছে।',
  },
  OrderOnHoldNotSent: {
    en: 'This order is on hold or in review. Clear that first, then send it.',
    bn: 'এই অর্ডার হোল্ডে বা রিভিউতে আছে। আগে সেটা সরান, তারপর পাঠান।',
  },
  HandOverInstead: {
    en: 'A takeaway or dine-in order is handed over, not shipped.',
    bn: 'টেকঅ্যাওয়ে বা ডাইন-ইন অর্ডার শিপ হয় না, হ্যান্ড ওভার করা হয়।',
  },
  ShipInstead: {
    en: 'A delivery order is shipped with a courier, not handed over.',
    bn: 'ডেলিভারি অর্ডার হ্যান্ড ওভার হয় না, কুরিয়ারে শিপ করা হয়।',
  },
  MoreReturnedThanShipped: {
    en: (p) => `More "${String(p.product)}" would come back than was shipped.`,
    bn: (p) => `যত "${String(p.product)}" শিপ হয়েছিল, তার চেয়ে বেশি ফেরত দেখানো হচ্ছে।`,
  },
  OrdersHandlingReached: {
    en: (p) =>
      `Your plan handles ${String(p.limit)} orders this period, and that is used up. Upgrade, or wait for the next period.`,
    bn: (p) =>
      `আপনার প্ল্যানে এই মেয়াদে ${String(p.limit)}টা অর্ডার হ্যান্ডেল করা যায়, সেটা শেষ। আপগ্রেড করুন, অথবা পরের মেয়াদের অপেক্ষা করুন।`,
  },
  OrdersDailyHandlingReached: {
    en: (p) =>
      `Your plan handles ${String(p.limit)} orders a day, and today's are used up. More can be sent tomorrow.`,
    bn: (p) =>
      `আপনার প্ল্যানে দিনে ${String(p.limit)}টা অর্ডার হ্যান্ডেল করা যায়, আজকেরগুলো শেষ। কাল আবার পাঠানো যাবে।`,
  },
  OrdersTotalHandlingReached: {
    en: (p) =>
      `The trial handles ${String(p.limit)} orders, and they are used up. Choose a plan to send more.`,
    bn: (p) =>
      `ট্রায়ালে ${String(p.limit)}টা অর্ডার হ্যান্ডেল করা যায়, সেগুলো শেষ। আরও পাঠাতে একটা প্ল্যান নিন।`,
  },
  OrderShipped: {
    en: 'Order marked shipped.',
    bn: 'অর্ডার শিপড মার্ক করা হয়েছে।',
  },
  OrderHandedOver: {
    en: 'Order handed over.',
    bn: 'অর্ডার হ্যান্ড ওভার করা হয়েছে।',
  },
  OrderDelivered: {
    en: 'Order marked delivered.',
    bn: 'অর্ডার ডেলিভারড মার্ক করা হয়েছে।',
  },
  OrderReturnRecorded: {
    en: 'Return recorded.',
    bn: 'রিটার্ন রেকর্ড করা হয়েছে।',
  },
  OrderNothingDue: {
    en: 'Nothing is due on this order.',
    bn: 'এই অর্ডারে কোনো ডিউ নেই।',
  },
  PaymentMoreThanDue: {
    en: (p) => `Only ৳${String(p.due)} is due on this order.`,
    bn: (p) => `এই অর্ডারে ডিউ মাত্র ৳${String(p.due)}।`,
  },
  OrderTotalBelowPaid: {
    en: (p) =>
      `৳${String(p.paid)} is already paid on this order, so its total can't go below that. Void a payment first.`,
    bn: (p) =>
      `এই অর্ডারে ইতিমধ্যে ৳${String(p.paid)} পেমেন্ট হয়েছে, তাই টোটাল এর নিচে নামানো যায় না। আগে একটি পেমেন্ট ভয়েড করুন।`,
  },
  OrderPaymentNotFound: {
    en: 'Payment not found.',
    bn: 'পেমেন্টটি পাওয়া যায়নি।',
  },
  PaymentAlreadyVoided: {
    en: 'This payment is already void.',
    bn: 'এই পেমেন্ট আগেই ভয়েড করা হয়েছে।',
  },
  CashOnDeliveryKept: {
    en: "Cash on delivery is collected when the order is delivered, so it can't be voided.",
    bn: 'অর্ডার ডেলিভারড হলে ক্যাশ অন ডেলিভারি কালেক্ট হয়, তাই এটি ভয়েড করা যায় না।',
  },
  OrderPaymentRecorded: {
    en: 'Payment recorded.',
    bn: 'পেমেন্ট রেকর্ড করা হয়েছে।',
  },
  OrderPaymentVoided: {
    en: 'Payment voided.',
    bn: 'পেমেন্ট ভয়েড করা হয়েছে।',
  },
  CustomersRetrieved: {
    en: 'Customers retrieved.',
    bn: 'কাস্টমারদের তালিকা পাওয়া গেছে।',
  },
  CustomerRetrieved: {
    en: 'Customer retrieved.',
    bn: 'কাস্টমারের তথ্য পাওয়া গেছে।',
  },
  CustomerNotFound: {
    en: 'Customer not found.',
    bn: 'কাস্টমার পাওয়া যায়নি।',
  },
  CustomerHasOpenOrders: {
    en: (p) =>
      Number(p.count) === 1
        ? "This customer has an order on its way. Once it's delivered, returned or cancelled, their details can be deleted."
        : `This customer has ${String(p.count)} orders on their way. Once they're delivered, returned or cancelled, their details can be deleted.`,
    bn: (p) =>
      `এই কাস্টমারের ${String(p.count)}টি অর্ডার এখনো চলছে। সেগুলো ডেলিভারড, রিটার্ন বা ক্যানসেল হলে তথ্য ডিলিট করা যাবে।`,
  },
  CustomerErased: {
    en: "The customer's details are deleted.",
    bn: 'কাস্টমারের তথ্য ডিলিট করা হয়েছে।',
  },
  ShopperAlreadyRegistered: {
    en: 'This phone already has an account here. Sign in with your password.',
    bn: 'এই ফোন নম্বরে এখানে আগেই অ্যাকাউন্ট আছে। পাসওয়ার্ড দিয়ে লগইন করুন।',
  },
  ShopCannotSendCode: {
    en: "This shop can't send a sign-up code right now. Please try again later.",
    bn: 'এই শপ এখন সাইন আপ কোড পাঠাতে পারছে না। পরে আবার ট্রাই করুন।',
  },
  ShopperAccountNotFound: {
    en: 'This customer has no account with the shop.',
    bn: 'এই কাস্টমারের শপে কোনো অ্যাকাউন্ট নেই।',
  },
  ShopperAddressNotFound: {
    en: 'Address not found.',
    bn: 'অ্যাড্রেস পাওয়া যায়নি।',
  },
  TooManyAddresses: {
    en: (p) => `You can save up to ${String(p.max)} addresses. Delete one to add another.`,
    bn: (p) => `সর্বোচ্চ ${String(p.max)}টি অ্যাড্রেস সেভ করা যায়। নতুন যোগ করতে একটি ডিলিট করুন।`,
  },
  ShopperCodeSent: {
    en: 'Code sent.',
    bn: 'কোড পাঠানো হয়েছে।',
  },
  ShopperSignedUp: {
    en: 'Your account is ready.',
    bn: 'আপনার অ্যাকাউন্ট তৈরি হয়েছে।',
  },
  ShopperSignedIn: {
    en: 'Signed in.',
    bn: 'লগইন হয়েছে।',
  },
  ShopperSignedOut: {
    en: 'Signed out.',
    bn: 'লগআউট হয়েছে।',
  },
  ShopperRetrieved: {
    en: 'Account retrieved.',
    bn: 'অ্যাকাউন্টের তথ্য পাওয়া গেছে।',
  },
  ShopperUpdated: {
    en: 'Account updated.',
    bn: 'অ্যাকাউন্ট আপডেট হয়েছে।',
  },
  ShopperAddressesRetrieved: {
    en: 'Addresses retrieved.',
    bn: 'অ্যাড্রেসগুলো পাওয়া গেছে।',
  },
  ShopperAddressSaved: {
    en: 'Address saved.',
    bn: 'অ্যাড্রেস সেভ হয়েছে।',
  },
  ShopperAddressRemoved: {
    en: 'Address deleted.',
    bn: 'অ্যাড্রেস ডিলিট হয়েছে।',
  },
  ShopperPasswordSet: {
    en: "The customer's new password is set. Their sign-ins have ended.",
    bn: 'কাস্টমারের নতুন পাসওয়ার্ড সেট হয়েছে। তাদের সব লগইন শেষ হয়েছে।',
  },
  TooManyTaxClasses: {
    en: (p) => `A shop can name up to ${String(p.max)} tax classes.`,
    bn: (p) => `একটি শপ সর্বোচ্চ ${String(p.max)}টি ট্যাক্স ক্লাস রাখতে পারে।`,
  },
  TaxClassNotFound: {
    en: 'Tax class not found.',
    bn: 'ট্যাক্স ক্লাস পাওয়া যায়নি।',
  },
  TaxClassInUse: {
    en: (p) =>
      Number(p.count) === 1
        ? 'A product uses this tax class. Give it another class first.'
        : `${String(p.count)} products use this tax class. Give them another class first.`,
    bn: (p) =>
      `${String(p.count)}টি প্রোডাক্ট এই ট্যাক্স ক্লাস ব্যবহার করছে। আগে সেগুলোতে অন্য ক্লাস দিন।`,
  },
  TaxClassNameTaken: {
    en: 'The shop already has a tax class of this name.',
    bn: 'এই নামে শপে আগেই একটি ট্যাক্স ক্লাস আছে।',
  },
  TaxClassesRetrieved: {
    en: 'Tax classes retrieved.',
    bn: 'ট্যাক্স ক্লাসগুলো পাওয়া গেছে।',
  },
  TaxClassSaved: {
    en: 'Tax settings saved.',
    bn: 'ট্যাক্স সেটিংস সেভ হয়েছে।',
  },
  TaxClassDeleted: {
    en: 'Tax class deleted.',
    bn: 'ট্যাক্স ক্লাস ডিলিট হয়েছে।',
  },
};

export function translate(key: MessageKey, lang: Language, params: MessageParams = {}): string {
  const text = DICTIONARY[key][lang];
  return typeof text === 'function' ? text(params) : text;
}
