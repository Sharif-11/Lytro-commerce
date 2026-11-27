import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import {
  TUTORIAL_SERIES,
  TutorialScreen,
  type TutorialKey,
  type TutorialsView,
} from '@lytronix/validators';

// TENANT-DASHBOARD-DESIGN §7.49, §7.49a: the tutorials as the server answers them. With no fixture every part has no file,
// so no screen draws a row, as on a platform where Lytro has uploaded nothing yet.

/** Where the mocked covers and videos are served from; the covers are the sketch's own title frames. */
export const TUTORIAL_FILES_PATH = '/__tutorials/';
const SAMPLES = resolve(import.meta.dirname, '../../../../docs/brand/sample-photos/tutorials');

// The sketch's covers (`sample-photos/tutorials/t*.jpg`), by part.
const COVERS: Partial<Record<TutorialKey, string>> = {
  '01-shop-setup': 't01',
  '02-categories': 't02',
  '03-add-product': 't03',
  '04-share-links': 't04',
  '05-meta-pixel': 't05',
  '06a-boost': 't06a',
  '07-steadfast': 't07',
};

/** The sketch's lengths (the owner's own videos): 1:37, 1:47, 3:12, 1:27, 1:47, 2:51 and 1:15. */
export const DRAWN_LENGTHS: Partial<Record<TutorialKey, number>> = {
  '01-shop-setup': 97,
  '02-categories': 107,
  '03-add-product': 192,
  '04-share-links': 87,
  '05-meta-pixel': 107,
  '06a-boost': 171,
  '07-steadfast': 75,
};

/** Every part with no file: what a shop sees before Lytro uploads anything. */
export function noTutorials(): TutorialsView {
  return {
    parts: TUTORIAL_SERIES.map((part) => ({ key: part.key, video: null, watched: false })),
    dismissed: [],
    playlistUrl: null,
  };
}

/**
 * The sketch's state (`tv-*`): parts 1 to 7 but 6খ have a file, parts 1 and 2 watched, the YouTube playlist set.
 * `watched` and `more` change it for a state.
 */
export function drawnTutorials(
  watched: TutorialKey[] = ['01-shop-setup', '02-categories'],
  more: Partial<TutorialsView> = {},
): TutorialsView {
  return {
    parts: TUTORIAL_SERIES.map((part) => {
      const seconds = DRAWN_LENGTHS[part.key];
      return {
        key: part.key,
        video:
          seconds === undefined
            ? null
            : {
                url: `${TUTORIAL_FILES_PATH}${part.key}-v1.mp4`,
                coverUrl: `${TUTORIAL_FILES_PATH}${COVERS[part.key] ?? 't01'}.jpg`,
                durationSeconds: seconds,
                version: 1,
              },
        watched: watched.includes(part.key),
      };
    }),
    dismissed: [],
    playlistUrl: 'https://www.youtube.com/playlist?list=PLOcfDXgUTCdc',
    ...more,
  };
}

/** The mocked files: a cover is the sketch's picture; a video answers 404, so the player keeps showing its cover. */
export async function serveTutorialFiles(page: Page): Promise<void> {
  await page.route(`**${TUTORIAL_FILES_PATH}**`, (route: Route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    if (name.endsWith('.jpg')) return route.fulfill({ path: resolve(SAMPLES, name) });
    return route.fulfill({ status: 404 });
  });
}

/** GET /tutorials, a part watched, a screen's videos hidden; null for any other call. */
export function tutorialsAnswer(
  view: TutorialsView,
  method: string,
  path: string,
  body: Record<string, unknown> | null,
): unknown {
  if (method === 'GET' && path === '/tutorials') return view;
  const watched = /^\/tutorials\/([^/]+)\/watched$/.exec(path);
  if (method === 'POST' && watched) {
    const part = view.parts.find((each) => each.key === watched[1]);
    if (part) part.watched = true;
    return { ok: true };
  }
  if (method === 'POST' && path === '/tutorials/dismissals') {
    const screen = Object.values(TutorialScreen).find((each) => each === body?.['screen']);
    if (screen && !view.dismissed.includes(screen)) view.dismissed.push(screen);
    return { ok: true };
  }
  return null;
}
