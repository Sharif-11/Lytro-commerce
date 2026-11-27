import { z } from 'zod';
import { FieldProblemCode } from '../../validation/field-problem';

// TENANT-DASHBOARD-DESIGN §7.49, §7.49a and OPERATOR-CONSOLE-DESIGN §10h (the owner, 2026-11-27, "all point agreed"): the
// in-app tutorial videos. The series -- its keys, its order, the names and lines in both languages, and the screens each
// video shows on -- is written here once, and the server, the dashboard and the console all read it. A new tutorial is a
// change to this list; the console only sets each one's file.

/**
 * The places a tutorial's row is drawn. A screen's row sits under its title and has "আর দেখাবেন না" (per person, per
 * screen); the two in-card places (the share sheet and Shop details' shop link card) have no dismiss and hide once that
 * person has watched the video. `home` is the set-up card's head (§7.49a).
 */
export enum TutorialScreen {
  Home = 'home',
  Products = 'products',
  QuickAdd = 'quick_add',
  Categories = 'categories',
  ShopDetails = 'shop_details',
  Delivery = 'delivery',
  ShareSheet = 'share_sheet',
  ShopLinkCard = 'shop_link_card',
  AdsFeed = 'ads_feed',
  Couriers = 'couriers',
  Orders = 'orders',
  PaymentMethods = 'payment_methods',
  StorefrontDesign = 'storefront_design',
  Plan = 'plan',
}

/** §7.49: the rows inside a card or a sheet, which have no "আর দেখাবেন না" and go once their video is watched. */
export const TUTORIAL_IN_CARD_SCREENS: readonly TutorialScreen[] = [
  TutorialScreen.ShareSheet,
  TutorialScreen.ShopLinkCard,
];

/** The screens a person may hide the videos on: every one but the in-card places. */
export const TUTORIAL_DISMISSABLE_SCREENS = Object.values(TutorialScreen).filter(
  (screen) => !TUTORIAL_IN_CARD_SCREENS.includes(screen),
) as [TutorialScreen, ...TutorialScreen[]];

/** A line in both languages. */
export interface TutorialWords {
  en: string;
  bn: string;
}

interface TutorialPartDefinition {
  /** The file's stem too: `platform/tutorials/<key>-v<N>.mp4`. */
  key: string;
  /** The part's own number, "6a" / "৬ক". */
  part: TutorialWords;
  name: TutorialWords;
  /** The row's line after "ভিডিও দেখুন:". */
  how: TutorialWords;
  /** The console's "দেখায়:" line, the screens in words. */
  where: TutorialWords;
  screens: readonly TutorialScreen[];
}

const words = (en: string, bn: string): TutorialWords => ({ en, bn });

/** §7.49's table, in the series' order: 14 parts, part 6 being 6ক and 6খ. */
export const TUTORIAL_SERIES = [
  {
    key: '01-shop-setup',
    part: words('1', '১'),
    name: words('Shop setting', 'শপ সাজানো'),
    how: words('How to set up your shop', 'কীভাবে শপ সাজাবেন'),
    where: words('Shop details, Delivery', 'শপের তথ্য, ডেলিভারি'),
    screens: [TutorialScreen.ShopDetails, TutorialScreen.Delivery],
  },
  {
    key: '02-categories',
    part: words('2', '২'),
    name: words('Category management', 'ক্যাটাগরি ম্যানেজমেন্ট'),
    how: words('How to make and arrange categories', 'কীভাবে ক্যাটাগরি বানাবেন আর সাজাবেন'),
    where: words('Categories', 'ক্যাটাগরি'),
    screens: [TutorialScreen.Categories],
  },
  {
    key: '03-add-product',
    part: words('3', '৩'),
    name: words('Adding a product', 'প্রোডাক্ট যোগ'),
    how: words('How to add a product', 'কীভাবে প্রোডাক্ট যোগ করবেন'),
    where: words('Products (empty), Quick add', 'প্রোডাক্ট (খালি অবস্থায়), কুইক অ্যাড'),
    screens: [TutorialScreen.Products, TutorialScreen.QuickAdd],
  },
  {
    key: '04-share-links',
    part: words('4', '৪'),
    name: words('Sharing links', 'লিংক শেয়ার'),
    how: words('How to share your links', 'কীভাবে লিংক শেয়ার করবেন'),
    where: words('The share sheet, the shop link card', 'শেয়ার শিট, শপের লিংকের কার্ড'),
    screens: [TutorialScreen.ShareSheet, TutorialScreen.ShopLinkCard],
  },
  {
    key: '05-meta-pixel',
    part: words('5', '৫'),
    name: words('Meta Pixel', 'Meta Pixel'),
    how: words('How to add Meta Pixel', 'কীভাবে Meta Pixel যোগ করবেন'),
    where: words('Ads and feed', 'বিজ্ঞাপন ও ফিড'),
    screens: [TutorialScreen.AdsFeed],
  },
  {
    key: '06a-boost',
    part: words('6a', '৬ক'),
    name: words('Boosting a product', 'প্রোডাক্ট বুস্ট'),
    how: words('How to boost a product', 'কীভাবে প্রোডাক্ট বুস্ট করবেন'),
    where: words('Ads and feed', 'বিজ্ঞাপন ও ফিড'),
    screens: [TutorialScreen.AdsFeed],
  },
  {
    key: '06b-ad-campaign',
    part: words('6b', '৬খ'),
    name: words('Ad campaign', 'অ্যাড ক্যাম্পেইন'),
    how: words('How to run an ad campaign', 'কীভাবে অ্যাড ক্যাম্পেইন দেবেন'),
    where: words('Ads and feed', 'বিজ্ঞাপন ও ফিড'),
    screens: [TutorialScreen.AdsFeed],
  },
  {
    key: '07-steadfast',
    part: words('7', '৭'),
    name: words('Steadfast', 'Steadfast'),
    how: words('How to connect Steadfast', 'কীভাবে Steadfast কানেক্ট করবেন'),
    where: words('Couriers', 'কুরিয়ার'),
    screens: [TutorialScreen.Couriers],
  },
  {
    key: '08-pathao-redx',
    part: words('8', '৮'),
    name: words('Pathao and RedX', 'Pathao আর RedX'),
    how: words('How to connect Pathao and RedX', 'কীভাবে Pathao আর RedX কানেক্ট করবেন'),
    where: words('Couriers', 'কুরিয়ার'),
    screens: [TutorialScreen.Couriers],
  },
  {
    key: '09-orders',
    part: words('9', '৯'),
    name: words('Handling orders', 'অর্ডার হ্যান্ডলিং'),
    how: words('How to handle orders', 'কীভাবে অর্ডার সামলাবেন'),
    where: words('Orders', 'অর্ডার'),
    screens: [TutorialScreen.Orders],
  },
  {
    key: '10-bkash',
    part: words('10', '১০'),
    name: words('bKash', 'বিকাশ'),
    how: words('How to connect bKash', 'কীভাবে বিকাশ কানেক্ট করবেন'),
    where: words('Payment methods', 'পেমেন্ট মেথড'),
    screens: [TutorialScreen.PaymentMethods],
  },
  {
    key: '11-nagad',
    part: words('11', '১১'),
    name: words('Nagad', 'নগদ'),
    how: words('How to connect Nagad', 'কীভাবে নগদ কানেক্ট করবেন'),
    where: words('Payment methods', 'পেমেন্ট মেথড'),
    screens: [TutorialScreen.PaymentMethods],
  },
  {
    key: '12-theme',
    part: words('12', '১২'),
    name: words('Theme', 'থিম'),
    how: words('How to change the theme and design', 'কীভাবে থিম আর ডিজাইন বদলাবেন'),
    where: words('Storefront design', 'স্টোরফ্রন্ট ডিজাইন'),
    screens: [TutorialScreen.StorefrontDesign],
  },
  {
    key: '13-plan',
    part: words('13', '১৩'),
    name: words('Plan', 'প্ল্যান'),
    how: words('How to buy a plan', 'কীভাবে প্ল্যান কিনবেন'),
    where: words('Plan', 'প্ল্যান'),
    screens: [TutorialScreen.Plan],
  },
] as const satisfies readonly TutorialPartDefinition[];

export type TutorialPart = (typeof TUTORIAL_SERIES)[number];
export type TutorialKey = TutorialPart['key'];

export const TUTORIAL_KEYS = TUTORIAL_SERIES.map((part) => part.key) as [
  TutorialKey,
  ...TutorialKey[],
];

/** One part by its key; undefined for a key that is not in the series. */
export function tutorialPartOf(key: string): TutorialPart | undefined {
  return TUTORIAL_SERIES.find((part) => part.key === key);
}

/** The parts drawn on a screen, in the series' order. */
export function tutorialPartsOn(screen: TutorialScreen): TutorialPart[] {
  return TUTORIAL_SERIES.filter((part) =>
    (part.screens as readonly TutorialScreen[]).includes(screen),
  );
}

/** §7.49a: the four videos at the head of Home's set-up card, in order. */
export const TUTORIAL_HOME_FOUR: readonly TutorialKey[] = [
  '01-shop-setup',
  '02-categories',
  '03-add-product',
  '04-share-links',
];

/** §7.49a: the set-up steps that carry their video's "▶ ভিডিও" chip. */
export const TUTORIAL_HOME_STEPS = {
  product: '03-add-product',
  share: '04-share-links',
  logo: '01-shop-setup',
  courier: '07-steadfast',
} as const satisfies Readonly<Record<string, TutorialKey>>;

/** §7.49a: the head of Home's set-up card: the next video large, one line once the four are watched, or none. */
export enum TutorialsHead {
  Full = 'full',
  Small = 'small',
}

// §10h: what the console takes. A portrait 9:16 MP4 with H.264 video and AAC sound, up to 80 MB.
export const TUTORIAL_CONTENT_TYPE = 'video/mp4';
export const TUTORIAL_MAX_MB = 80;
export const TUTORIAL_MAX_BYTES = TUTORIAL_MAX_MB * 1024 * 1024;
/** 9:16, width over height. */
export const TUTORIAL_ASPECT = 9 / 16;
/** How far a file's width over height may be from 9:16 and still count as it (1088 × 1920 is 0.7% off). */
export const TUTORIAL_ASPECT_TOLERANCE = 0.02;
export const TUTORIAL_VIDEO_CODEC = 'h264';
export const TUTORIAL_AUDIO_CODEC = 'aac';
/** §10h: a replaced or removed file stays this long, so nobody watching it is cut off, then it is deleted. */
export const TUTORIAL_OLD_FILE_DAYS = 7;
/** §7.49: a video counts as watched once it has played to the end or past this share of its length. */
export const TUTORIAL_WATCHED_SHARE = 0.9;
export const TUTORIAL_PLAYLIST_MAX = 300;

/** Whether a picture of this size is portrait 9:16 (§10h). */
export function isTutorialShape(width: number, height: number): boolean {
  if (!(width > 0 && height > 0) || width >= height) return false;
  return Math.abs(width / height - TUTORIAL_ASPECT) / TUTORIAL_ASPECT <= TUTORIAL_ASPECT_TOLERANCE;
}

/** A playlist link the line may open: https, on YouTube. */
export function isYoutubeLink(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be')
    );
  } catch {
    return false;
  }
}

/** §7.49: "আর দেখাবেন না" on a screen. */
export const tutorialDismissSchema = z.object({ screen: z.enum(TUTORIAL_DISMISSABLE_SCREENS) });
export type TutorialDismissInput = z.infer<typeof tutorialDismissSchema>;

/** §10h: an upload to start; the browser then PUTs the file to the signed link and names its key to publish it. */
export const tutorialUploadStartSchema = z.object({
  contentType: z.literal(TUTORIAL_CONTENT_TYPE),
  bytes: z.number().int().positive().max(TUTORIAL_MAX_BYTES),
});
export type TutorialUploadStartInput = z.infer<typeof tutorialUploadStartSchema>;

/** §10h: the uploaded file, checked and made live. */
export const tutorialPublishSchema = z.object({ uploadKey: z.string().min(1).max(200) });
export type TutorialPublishInput = z.infer<typeof tutorialPublishSchema>;

/** §10h: the optional YouTube playlist link; null or empty takes the line away. */
export const tutorialPlaylistSchema = z.object({
  playlistUrl: z
    .string()
    .trim()
    .max(TUTORIAL_PLAYLIST_MAX)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value))
    .refine((value) => value === null || isYoutubeLink(value), {
      message: 'Paste a YouTube link that starts with https://',
      params: { problem: FieldProblemCode.InvalidFormat },
    }),
});
export type TutorialPlaylistInput = z.infer<typeof tutorialPlaylistSchema>;

/** A part's live file as the seller's app plays it. */
export interface TutorialVideoView {
  url: string;
  coverUrl: string;
  durationSeconds: number;
  version: number;
}

/** One part for the person: its file, if it has one, and whether they watched it. */
export interface TutorialItemView {
  key: TutorialKey;
  video: TutorialVideoView | null;
  watched: boolean;
}

/** GET /tutorials: the series in order, the screens this person hid the videos on, and the playlist link. */
export interface TutorialsView {
  parts: TutorialItemView[];
  dismissed: TutorialScreen[];
  playlistUrl: string | null;
}

/** A part's live file as the console shows it. */
export interface OperatorTutorialVideoView extends TutorialVideoView {
  /** The stored name, `platform/tutorials/03-add-product-v2.mp4`. */
  file: string;
  bytes: number;
  width: number;
  height: number;
  uploadedAt: string;
}

/** One row of the console's page: the live file, and the name the next upload is saved as. */
export interface OperatorTutorialView {
  key: TutorialKey;
  video: OperatorTutorialVideoView | null;
  nextFile: string;
}

export interface OperatorTutorialsView {
  parts: OperatorTutorialView[];
  playlistUrl: string | null;
}

/** What of SUP-01's first group the server can tell; the shop and its delivery are done from the start. */
export interface SetupFirstGroup {
  firstProduct: boolean;
  linkShared: boolean;
  logo: boolean;
  wallet: boolean;
}

/** SUP-01: the set-up card's first group -- the shop, its delivery, a product, the link shared, the logo, a wallet. */
export const SETUP_FIRST_GROUP = 6;

/** SUP-01: how many of the first group are done. The card folds at SETUP_FIRST_GROUP, and Home's videos go with it. */
export function setupDoneOf(checklist: SetupFirstGroup): number {
  return [
    true,
    true,
    checklist.firstProduct,
    checklist.linkShared,
    checklist.logo,
    checklist.wallet,
  ].filter(Boolean).length;
}
