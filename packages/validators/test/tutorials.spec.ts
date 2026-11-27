import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_DISMISSABLE_SCREENS,
  TUTORIAL_HOME_FOUR,
  TUTORIAL_HOME_STEPS,
  TUTORIAL_IN_CARD_SCREENS,
  TUTORIAL_KEYS,
  TUTORIAL_SERIES,
  TutorialScreen,
  isTutorialShape,
  isYoutubeLink,
  setupDoneOf,
  tutorialPartsOn,
  tutorialPlaylistSchema,
} from '../src';

// TENANT-DASHBOARD-DESIGN §7.49, OPERATOR-CONSOLE-DESIGN §10h: the series as code, read by the server, the dashboard and
// the console alike.
describe('the tutorial series', () => {
  it('is the 14 parts in order, part 6 split in two, each key unique and a file stem', () => {
    expect(TUTORIAL_KEYS).toEqual([
      '01-shop-setup',
      '02-categories',
      '03-add-product',
      '04-share-links',
      '05-meta-pixel',
      '06a-boost',
      '06b-ad-campaign',
      '07-steadfast',
      '08-pathao-redx',
      '09-orders',
      '10-bkash',
      '11-nagad',
      '12-theme',
      '13-plan',
    ]);
    expect(new Set(TUTORIAL_KEYS).size).toBe(TUTORIAL_KEYS.length);
    expect(TUTORIAL_SERIES.map((part) => part.part.bn)).toContain('৬খ');
    for (const part of TUTORIAL_SERIES) {
      expect(part.key).toMatch(/^[0-9]{2}[a-z]?-[a-z0-9-]+$/);
      expect(part.screens.length).toBeGreaterThan(0);
      expect(part.name.bn).not.toMatch(/পণ্য|বাছুন/);
    }
  });

  it('maps each screen to its parts, Ads and feed to 5, 6a and 6b', () => {
    expect(tutorialPartsOn(TutorialScreen.AdsFeed).map((part) => part.key)).toEqual([
      '05-meta-pixel',
      '06a-boost',
      '06b-ad-campaign',
    ]);
    expect(tutorialPartsOn(TutorialScreen.ShareSheet).map((part) => part.key)).toEqual([
      '04-share-links',
    ]);
    expect(tutorialPartsOn(TutorialScreen.Home)).toEqual([]);
  });

  it("lets every screen but the in-card places be dismissed, Home's head among them", () => {
    expect(TUTORIAL_DISMISSABLE_SCREENS).toContain(TutorialScreen.Home);
    for (const screen of TUTORIAL_IN_CARD_SCREENS) {
      expect(TUTORIAL_DISMISSABLE_SCREENS).not.toContain(screen);
    }
  });

  it("puts parts 1 to 4 at Home's head, and the step chips on parts of the series", () => {
    expect(TUTORIAL_HOME_FOUR).toEqual(TUTORIAL_KEYS.slice(0, 4));
    for (const key of Object.values(TUTORIAL_HOME_STEPS)) expect(TUTORIAL_KEYS).toContain(key);
  });
});

describe('the upload checks', () => {
  it('takes portrait 9:16, a hair off for an encoder, and nothing else', () => {
    expect(isTutorialShape(1080, 1920)).toBe(true);
    expect(isTutorialShape(720, 1280)).toBe(true);
    expect(isTutorialShape(1088, 1920)).toBe(true);
    expect(isTutorialShape(1920, 1080)).toBe(false);
    expect(isTutorialShape(1080, 1440)).toBe(false);
    expect(isTutorialShape(1080, 1080)).toBe(false);
    expect(isTutorialShape(0, 0)).toBe(false);
  });

  it('takes an https YouTube playlist link, or none', () => {
    expect(isYoutubeLink('https://www.youtube.com/playlist?list=PL1')).toBe(true);
    expect(isYoutubeLink('https://youtu.be/abc')).toBe(true);
    expect(isYoutubeLink('http://www.youtube.com/playlist?list=PL1')).toBe(false);
    expect(isYoutubeLink('https://notyoutube.com/x')).toBe(false);
    expect(tutorialPlaylistSchema.parse({ playlistUrl: '  ' }).playlistUrl).toBe(null);
    expect(tutorialPlaylistSchema.safeParse({ playlistUrl: 'https://x.com' }).success).toBe(false);
  });
});

describe("the set-up card's first group (SUP-01)", () => {
  it('counts the shop and its delivery as done from the start', () => {
    const none = { firstProduct: false, linkShared: false, logo: false, wallet: false };
    expect(setupDoneOf(none)).toBe(2);
    expect(setupDoneOf({ firstProduct: true, linkShared: true, logo: true, wallet: true })).toBe(6);
  });
});
