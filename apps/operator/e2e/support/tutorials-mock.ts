import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { TUTORIAL_SERIES, type OperatorTutorialView, type TutorialKey } from '@lytronix/validators';

// OPERATOR-CONSOLE-DESIGN §10h: the Tutorials page's server as the sketch draws it (`tv-tutorials`): parts 1 to 7 live but
// 6খ, part 3 at its second version, the playlist link set. An upload makes the part's next version live; remove takes it
// off. The covers are the sketch's own title frames.

export interface TutorialsMockState {
  parts: OperatorTutorialView[];
  playlistUrl: string | null;
}

const SAMPLES = resolve(import.meta.dirname, '../../../../docs/brand/sample-photos/tutorials');
const FILES = '/__tutorials/';
const UPLOAD = '/__tutorial-upload/';
export const DRAWN_PLAYLIST = 'https://www.youtube.com/playlist?list=PLOcfDXgUTCdc';

// The sketch's lengths and versions, and its cover by part (6খ has none drawn).
const DRAWN: Partial<Record<TutorialKey, { seconds: number; version: number; cover?: string }>> = {
  '01-shop-setup': { seconds: 97, version: 1, cover: 't01' },
  '02-categories': { seconds: 107, version: 1, cover: 't02' },
  '03-add-product': { seconds: 192, version: 2, cover: 't03' },
  '04-share-links': { seconds: 87, version: 1, cover: 't04' },
  '05-meta-pixel': { seconds: 107, version: 1, cover: 't05' },
  '06a-boost': { seconds: 171, version: 1, cover: 't06a' },
  '07-steadfast': { seconds: 75, version: 1, cover: 't07' },
};

// What an upload in a test turns out to be: the sketch's 6খ at 2:35, its part 3 replacement at 3:20.
const UPLOADED: Partial<Record<TutorialKey, number>> = {
  '06b-ad-campaign': 155,
  '03-add-product': 200,
};

const file = (key: string, version: number): string =>
  `platform/tutorials/${key}-v${String(version)}.mp4`;

function live(
  key: TutorialKey,
  seconds: number,
  version: number,
  cover?: string,
): OperatorTutorialView {
  return {
    key,
    video: {
      url: `${FILES}${key}-v${String(version)}.mp4`,
      coverUrl: `${FILES}${cover ?? `${key}-v${String(version)}`}.jpg`,
      durationSeconds: seconds,
      version,
      file: file(key, version),
      bytes: 21 * 1024 * 1024,
      width: 1080,
      height: 1920,
      uploadedAt: '2026-11-27T10:00:00.000Z',
    },
    nextFile: file(key, version + 1),
  };
}

/** The sketch's page; `live6b` is its `tv-uploaded`, part 6খ just made live. */
export function drawnConsoleTutorials(options: { live6b?: boolean } = {}): TutorialsMockState {
  return {
    parts: TUTORIAL_SERIES.map((part) => {
      const drawn = DRAWN[part.key];
      if (drawn) return live(part.key, drawn.seconds, drawn.version, drawn.cover);
      if (options.live6b && part.key === '06b-ad-campaign') return live(part.key, 155, 1);
      return { key: part.key, video: null, nextFile: file(part.key, 1) };
    }),
    playlistUrl: DRAWN_PLAYLIST,
  };
}

/** The covers, and the signed links an upload sends its file to. */
export async function serveTutorialFiles(page: Page): Promise<void> {
  await page.route(`**${FILES}**`, (route: Route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    if (/^t[0-9a-z]+\.jpg$/.test(name)) return route.fulfill({ path: resolve(SAMPLES, name) });
    return route.fulfill({ status: 404 });
  });
  await page.route(`**${UPLOAD}**`, (route: Route) => route.fulfill({ status: 200 }));
}

/** The console's tutorial routes; undefined for any other. */
export function tutorialsAnswer(
  state: TutorialsMockState,
  method: string,
  path: string,
  body: Record<string, unknown> | null,
): unknown {
  if (method === 'GET' && path === '/operator/tutorials') return state;
  if (method === 'PUT' && path === '/operator/tutorials/playlist') {
    const link = typeof body?.['playlistUrl'] === 'string' ? body['playlistUrl'] : null;
    state.playlistUrl = link;
    return { playlistUrl: link };
  }
  const uploads = /^\/operator\/tutorials\/([^/]+)\/uploads$/.exec(path);
  if (method === 'POST' && uploads) {
    return {
      uploadKey: `tutorials/${uploads[1] ?? ''}/upload-1`,
      upload: {
        url: `${UPLOAD}${uploads[1] ?? ''}`,
        method: 'PUT',
        headers: { 'content-type': 'video/mp4' },
        expiresAt: '2026-11-27T10:15:00.000Z',
      },
    };
  }
  const one = /^\/operator\/tutorials\/([^/]+)$/.exec(path);
  const at = one ? state.parts.findIndex((each) => each.key === one[1]) : -1;
  const row = state.parts[at];
  if (!row) return undefined;
  if (method === 'PUT') {
    const version = Number(/-v(\d+)\.mp4$/.exec(row.nextFile)?.[1] ?? '1');
    const made = live(row.key, UPLOADED[row.key] ?? 120, version);
    state.parts[at] = made;
    return made;
  }
  if (method === 'DELETE') {
    const gone = { key: row.key, video: null, nextFile: row.nextFile };
    state.parts[at] = gone;
    return gone;
  }
  return undefined;
}
