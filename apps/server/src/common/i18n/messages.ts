import type { MessageKey } from './message-key';
import type { Lang } from './accept-language';

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
  CreateShopToContinue: {
    en: 'Create your shop to continue.',
    bn: 'চালিয়ে যেতে আপনার শপ তৈরি করুন।',
  },
  SetPasswordToContinue: {
    en: 'Set a password to continue.',
    bn: 'চালিয়ে যেতে একটি পাসওয়ার্ড সেট করুন।',
  },
  ShopUnavailable: { en: 'This shop is not available right now.', bn: 'এই শপটি এখন উপলব্ধ নয়।' },
  PermissionDenied: {
    en: 'You do not have permission for this.',
    bn: 'এটি করার অনুমতি আপনার নেই।',
  },
  PageNotFound: { en: 'Page not found.', bn: 'পেজটি খুঁজে পাওয়া যায়নি।' },
  SomethingWentWrong: {
    en: 'Something went wrong. Please try again.',
    bn: 'কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
  },
  ReasonRequired: { en: 'A reason is required.', bn: 'একটি কারণ উল্লেখ করা আবশ্যক।' },
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
    en: 'This amount is outside the allowed range.',
    bn: 'এই পরিমাণ অনুমোদিত সীমার বাইরে।',
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
    en: 'An upgrade is already pending for this shop.',
    bn: 'এই শপের জন্য একটি আপগ্রেড ইতিমধ্যে পেন্ডিং আছে।',
  },
  UpgradeNotWorthwhile: {
    en: 'The credit for your remaining days covers this plan and term. Please choose a longer term.',
    bn: 'আপনার বাকি দিনের ক্রেডিট এই প্ল্যান ও মেয়াদের দাম কভার করে। অনুগ্রহ করে দীর্ঘ মেয়াদ বেছে নিন।',
  },
  DowngradeNotAvailable: {
    en: 'Downgrade is only available while your plan is active.',
    bn: 'ডাউনগ্রেড শুধুমাত্র প্ল্যান চালু থাকলে উপলব্ধ।',
  },
  DowngradeMustBeLowerRank: {
    en: 'You can only downgrade to a lower plan.',
    bn: 'আপনি শুধুমাত্র নিম্নতর প্ল্যানে ডাউনগ্রেড করতে পারবেন।',
  },
  ScheduledChangeNotFound: {
    en: 'No scheduled change was found for this shop.',
    bn: 'এই শপের জন্য কোনো নির্ধারিত পরিবর্তন পাওয়া যায়নি।',
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
  EmailInvalid: { en: 'Enter a valid email address.', bn: 'একটি সঠিক ইমেইল অ্যাড্রেস দিন।' },
  CodeInvalid: {
    en: 'This code is not valid. Request a new one.',
    bn: 'এই কোডটি সঠিক নয়। নতুন একটি কোড নিন।',
  },
  CodeExpired: {
    en: 'This code has expired. Request a new one.',
    bn: 'এই কোডের মেয়াদ শেষ হয়ে গেছে। নতুন একটি কোড নিন।',
  },
  CodeIncorrect: { en: 'The code is not correct.', bn: 'কোডটি সঠিক নয়।' },
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
  PhoneInvalid: {
    en: 'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.',
    bn: 'একটি বাংলাদেশি মোবাইল নম্বর দিন, যেমন 017XXXXXXXX।',
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
  CurrentPasswordRequired: {
    en: 'Enter your current password.',
    bn: 'আপনার কারেন্ট পাসওয়ার্ড দিন।',
  },
  CurrentPasswordWrong: {
    en: 'Your current password is not correct.',
    bn: 'আপনার কারেন্ট পাসওয়ার্ডটি সঠিক নয়।',
  },
  ShopAlreadyExists: {
    en: 'This account already has a shop.',
    bn: 'এই অ্যাকাউন্টের শপ আগে থেকেই আছে।',
  },
  AddressFormatInvalid: {
    en: 'Use 3 to 30 lowercase letters, digits or hyphens for the address.',
    bn: 'অ্যাড্রেসে ৩ থেকে ৩০টি ছোট হাতের অক্ষর, সংখ্যা বা হাইফেন ব্যবহার করুন।',
  },
  AddressTaken: { en: 'That address is taken.', bn: 'এই অ্যাড্রেসটি আগে থেকেই নেওয়া আছে।' },
  AddressRequired: {
    en: 'Choose an address for your shop.',
    bn: 'আপনার শপের জন্য একটি অ্যাড্রেস বেছে নিন।',
  },
  TooManyFailedSignins: {
    en: 'Too many failed sign-ins. Wait before trying again.',
    bn: 'অনেকবার লগইন করতে ব্যর্থ হয়েছে। আবার চেষ্টা করার আগে অপেক্ষা করুন।',
  },
  TooManySignups: {
    en: 'Too many sign-ups from this address. Try again later.',
    bn: 'এই অ্যাড্রেস থেকে অনেকবার সাইন-আপ করা হয়েছে। পরে আবার চেষ্টা করুন।',
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

  ActivityListed: { en: 'Activity retrieved.', bn: 'অ্যাক্টিভিটি পাওয়া গেছে।' },
  BalanceRetrieved: { en: 'Balance retrieved.', bn: 'ব্যালেন্স পাওয়া গেছে।' },
  LedgerRetrieved: { en: 'Ledger retrieved.', bn: 'লেজার পাওয়া গেছে।' },
  RatesRetrieved: { en: 'Rates retrieved.', bn: 'রেট পাওয়া গেছে।' },
  BalanceAdjusted: { en: 'Balance adjusted.', bn: 'ব্যালেন্স অ্যাডজাস্ট হয়েছে।' },

  BillingTermsListed: { en: 'Billing terms retrieved.', bn: 'বিলিং টার্মগুলো পাওয়া গেছে।' },
  BillingTermCreated: { en: 'Billing term created.', bn: 'বিলিং টার্ম তৈরি হয়েছে।' },
  BillingTermUpdated: { en: 'Billing term updated.', bn: 'বিলিং টার্ম আপডেট হয়েছে।' },
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
  SettingsListed: { en: 'Settings retrieved.', bn: 'সেটিংসগুলো পাওয়া গেছে।' },
  SettingUpdated: { en: 'Setting updated.', bn: 'সেটিং আপডেট হয়েছে।' },

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
};

export function translate(key: MessageKey, lang: Lang, params: MessageParams = {}): string {
  const text = DICTIONARY[key][lang];
  return typeof text === 'function' ? text(params) : text;
}
