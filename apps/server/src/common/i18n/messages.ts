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
    bn: 'পাঠানো তথ্য পড়া যায়নি। আবার চেষ্টা করুন।',
  },
  RequestTooLarge: {
    en: 'Too much information was sent at once. Please send less and try again.',
    bn: 'একবারে অনেক বেশি তথ্য পাঠানো হয়েছে। কম করে আবার চেষ্টা করুন।',
  },
  TooManyRequests: {
    en: 'Too many requests. Please wait a moment and try again.',
    bn: 'অনেক বেশি রিকোয়েস্ট এসেছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।',
  },
  CreateShopToContinue: {
    en: 'Create your shop to continue.',
    bn: 'চালিয়ে যেতে আপনার দোকান তৈরি করুন।',
  },
  SetPasswordToContinue: {
    en: 'Set a password to continue.',
    bn: 'চালিয়ে যেতে একটি পাসওয়ার্ড সেট করুন।',
  },
  ShopUnavailable: {
    en: 'This shop is not available right now.',
    bn: 'এই দোকানটি এখন উপলব্ধ নয়।',
  },
  PermissionDenied: {
    en: 'You do not have permission for this.',
    bn: 'এটি করার অনুমতি আপনার নেই।',
  },
  PageNotFound: { en: 'Page not found.', bn: 'পেজটি খুঁজে পাওয়া যায়নি।' },
  SomethingWentWrong: {
    en: 'Something went wrong. Please try again.',
    bn: 'কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
  },
  SettingValueInvalid: {
    en: 'This value is not valid for this setting.',
    bn: 'এই সেটিংয়ের জন্য মানটি সঠিক নয়।',
  },
  PleaseTryAgain: { en: 'Please try again.', bn: 'অনুগ্রহ করে আবার চেষ্টা করুন।' },
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
  AmountOutOfRange: {
    en: (p) => `Enter an amount between ${String(p.min)} and ${String(p.max)} TK.`,
    bn: (p) => `${String(p.min)} থেকে ${String(p.max)} টাকার মধ্যে একটি অ্যামাউন্ট দিন।`,
  },
  TopUpNotAvailable: {
    en: 'Top-up is not available in the shop’s current state.',
    bn: 'দোকানের বর্তমান অবস্থায় টপ-আপ উপলব্ধ নয়।',
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
    en: 'An upgrade is already pending for this shop.',
    bn: 'এই দোকানের জন্য একটি আপগ্রেড ইতিমধ্যে পেন্ডিং আছে।',
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
    bn: 'এই দোকান এখন পে-অ্যাজ-ইউ-গো-তে যেতে পারবে না।',
  },
  CloseNotAvailable: {
    en: 'Only a pay-as-you-go shop can be closed. A shop on a plan stops at its period end when you cancel.',
    bn: 'শুধু পে-অ্যাজ-ইউ-গো দোকান বন্ধ করা যায়। প্ল্যানে থাকা দোকান ক্যানসেল করলে মেয়াদ শেষে বন্ধ হয়।',
  },
  DowngradeMustBeLowerRank: {
    en: 'You can only downgrade to a lower plan.',
    bn: 'আপনি শুধুমাত্র নিম্নতর প্ল্যানে ডাউনগ্রেড করতে পারবেন।',
  },
  ScheduledChangeNotFound: {
    en: 'No scheduled change was found for this shop.',
    bn: 'এই দোকানের জন্য কোনো নির্ধারিত পরিবর্তন পাওয়া যায়নি।',
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
    bn: 'এই আইডেন্টিটি আপনার দোকানের মালিক, তাই এটি রিমুভ করা যাবে না।',
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
    bn: 'এই নম্বর বা ইমেইলের জন্য অনেকবার কোড চাওয়া হয়েছে। পরে আবার চেষ্টা করুন।',
  },
  CodeSendFailed: {
    en: 'We could not send your code. Try again in a minute.',
    bn: 'আপনার কোড পাঠানো যায়নি। এক মিনিট পর আবার চেষ্টা করুন।',
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
    bn: 'এই অ্যাকাউন্টের দোকান আগে থেকেই আছে।',
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
    bn: 'আপনার দোকানের জন্য একটি লিংক বেছে নিন।',
  },
  TooManyFailedSignins: {
    en: 'Too many failed sign-ins. Wait before trying again.',
    bn: 'অনেকবার লগইন করতে ব্যর্থ হয়েছে। আবার চেষ্টা করার আগে অপেক্ষা করুন।',
  },
  TooManySignups: {
    en: 'Too many sign-ups from this address. Try again later.',
    bn: 'এই অ্যাড্রেস থেকে অনেকবার সাইন-আপ করা হয়েছে। পরে আবার চেষ্টা করুন।',
  },
  TooManyTrials: {
    en: 'Too many free trials. Try again later.',
    bn: 'অনেকবার ফ্রি ট্রায়াল নেওয়া হয়েছে। পরে আবার চেষ্টা করুন।',
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
    bn: 'এই ফোন নম্বরটি একজন দোকান ওনারের।',
  },
  StaffPhoneInUse: {
    en: 'That phone number is already in use.',
    bn: 'এই ফোন নম্বরটি আগে থেকেই ব্যবহৃত হচ্ছে।',
  },
  StaffNotFound: { en: 'Staff member not found.', bn: 'স্টাফ মেম্বারকে খুঁজে পাওয়া যায়নি।' },
  OwnerCannotBeChanged: { en: 'The owner cannot be changed.', bn: 'ওনারকে পরিবর্তন করা যাবে না।' },
  RoleNotInShop: {
    en: 'One of the roles does not exist in this shop.',
    bn: 'এই রোলগুলোর একটি এই দোকানে নেই।',
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
  OauthProvidersListed: { en: 'Sign-in options retrieved.', bn: 'লগইন অপশনগুলো পাওয়া গেছে।' },
  ShopCreated: { en: 'Shop created successfully.', bn: 'দোকান সফলভাবে তৈরি হয়েছে।' },

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
  ShopSettingsRetrieved: { en: 'Shop settings retrieved.', bn: 'দোকানের সেটিংস পাওয়া গেছে।' },
  ShopSettingsUpdated: { en: 'Shop settings updated.', bn: 'দোকানের সেটিংস আপডেট হয়েছে।' },
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
    bn: 'শুধু দোকানের ওনার এটি করতে পারবেন।',
  },

  QuoteCreated: { en: 'Quote created.', bn: 'কোট তৈরি হয়েছে।' },
  PurchaseConfirmed: { en: 'Purchase confirmed.', bn: 'কেনা নিশ্চিত হয়েছে।' },
  TopUpQuoted: { en: 'Top-up quote created.', bn: 'টপ-আপ কোট তৈরি হয়েছে।' },
  TopUpConfirmed: { en: 'Top-up confirmed.', bn: 'টপ-আপ নিশ্চিত হয়েছে।' },
  InvoicesListed: { en: 'Invoices retrieved.', bn: 'ইনভয়েসগুলো পাওয়া গেছে।' },
  InvoiceRetrieved: { en: 'Invoice retrieved.', bn: 'ইনভয়েস পাওয়া গেছে।' },
  PaymentQueueListed: { en: 'Payment queue retrieved.', bn: 'পেমেন্ট কিউ পাওয়া গেছে।' },
  PaymentApproved: { en: 'Payment approved.', bn: 'পেমেন্ট অনুমোদিত হয়েছে।' },
  PaymentRejected: { en: 'Payment rejected.', bn: 'পেমেন্ট বাতিল হয়েছে।' },
  UpgradeQuoted: { en: 'Upgrade quote created.', bn: 'আপগ্রেড কোট তৈরি হয়েছে।' },
  UpgradeSubmitted: { en: 'Upgrade payment submitted.', bn: 'আপগ্রেড পেমেন্ট জমা দেওয়া হয়েছে।' },
  UpgradeConfirmed: { en: 'Upgrade confirmed.', bn: 'আপগ্রেড নিশ্চিত হয়েছে।' },
  DowngradeScheduled: { en: 'Downgrade scheduled.', bn: 'ডাউনগ্রেড নির্ধারিত হয়েছে।' },
  PayAsYouGoChosen: { en: 'Pay-as-you-go chosen.', bn: 'পে-অ্যাজ-ইউ-গো বেছে নেওয়া হয়েছে।' },
  ShopClosed: { en: 'Shop closed.', bn: 'দোকান বন্ধ করা হয়েছে।' },
  DowngradeCancelled: { en: 'Downgrade cancelled.', bn: 'ডাউনগ্রেড বাতিল হয়েছে।' },
  DowngradePreviewed: { en: 'Downgrade preview retrieved.', bn: 'ডাউনগ্রেড প্রিভিউ পাওয়া গেছে।' },
  DowngradeRetrieved: { en: 'Scheduled change retrieved.', bn: 'নির্ধারিত পরিবর্তন পাওয়া গেছে।' },
  SubscriptionCancelled: {
    en: 'Subscription cancelled, effective at period end.',
    bn: 'সাবস্ক্রিপশন বাতিল হয়েছে, মেয়াদ শেষে কার্যকর হবে।',
  },
  SubscriptionCancellationUndone: {
    en: 'Cancellation undone.',
    bn: 'বাতিল প্রত্যাহার করা হয়েছে।',
  },
  AutoRenewUpdated: {
    en: 'Auto-renew setting updated.',
    bn: 'অটো-রিনিউ সেটিং আপডেট হয়েছে।',
  },
  CancellationRetrieved: {
    en: 'Cancellation status retrieved.',
    bn: 'বাতিলের অবস্থা পাওয়া গেছে।',
  },
  TenantsListed: { en: 'Tenants retrieved.', bn: 'টেন্যান্টগুলো পাওয়া গেছে।' },
  TenantSuspended: { en: 'Shop suspended.', bn: 'দোকান সাসপেন্ড হয়েছে।' },
  TenantRestored: { en: 'Shop restored.', bn: 'দোকান পুনরুদ্ধার হয়েছে।' },

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
    bn: 'আপনার দোকানের অন্য একটি ভ্যারিয়েন্টে এই SKU আগে থেকেই আছে।',
  },
  ProductSlugTaken: {
    en: 'Another product already uses this link. Choose another.',
    bn: 'অন্য একটি প্রোডাক্ট এই লিংক ব্যবহার করছে। অন্য একটি বেছে নিন।',
  },
  BusinessTypeUnknown: {
    en: 'Choose one of the listed shop types.',
    bn: 'লিস্টের দোকানের ধরনগুলো থেকে একটি বেছে নিন।',
  },
  AttributeValueWrongKind: {
    en: "This value doesn't fit the attribute's type.",
    bn: 'এই ভ্যালু অ্যাট্রিবিউটের টাইপের সাথে মেলে না।',
  },
  CapturedAttributeWrongType: {
    en: 'Only a text or number attribute can be filled in when ordering.',
    bn: 'শুধু টেক্সট বা সংখ্যার অ্যাট্রিবিউট অর্ডারের সময় পূরণ করা যায়।',
  },
  PresetsListed: {
    en: 'Shop types retrieved.',
    bn: 'দোকানের ধরনগুলো পাওয়া গেছে।',
  },
  ProductDefaultsRetrieved: {
    en: 'Product defaults retrieved.',
    bn: 'প্রোডাক্টের ডিফল্ট পাওয়া গেছে।',
  },
  BusinessTypeSaved: {
    en: 'Shop type saved.',
    bn: 'দোকানের ধরন সেভ হয়েছে।',
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
};

export function translate(key: MessageKey, lang: Language, params: MessageParams = {}): string {
  const text = DICTIONARY[key][lang];
  return typeof text === 'function' ? text(params) : text;
}
