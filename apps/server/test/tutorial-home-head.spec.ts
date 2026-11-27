import { describe, expect, it } from 'vitest';
import type { SelectTutorialVideo } from '@lytronix/db';
import { TutorialScreen, TutorialsHead } from '@lytronix/validators';
import { MediaLinks } from '../src/common/media-links';
import type { TutorialStore } from '../src/modules/tutorials/ports/tutorial-store';
import type { TutorialDesk } from '../src/modules/tutorials/services/tutorial-desk';
import { TutorialLibrary } from '../src/modules/tutorials/services/tutorial-library';

// TENANT-DASHBOARD-DESIGN §7.49a: who sees Home's videos, and when they go. DB-free: the store is a stand-in.

interface Shop {
  live: string[];
  owner: string | null;
  order: boolean;
  dismissed: TutorialScreen[];
  watched: string[];
}

function libraryOf(shop: Shop): TutorialLibrary {
  const row = (key: string) => ({ tutorialKey: key }) as SelectTutorialVideo;
  const store = {
    live: () => Promise.resolve(shop.live.map(row)),
    inShop: <T>(_tenantId: string, work: (tx: never) => Promise<T>) => work(undefined as never),
    ownerUserId: () => Promise.resolve(shop.owner),
    hasOrder: () => Promise.resolve(shop.order),
    dismissed: () => Promise.resolve(shop.dismissed),
    watched: () => Promise.resolve(shop.watched),
  } as unknown as TutorialStore;
  return new TutorialLibrary(
    store,
    new MediaLinks({ MEDIA_PUBLIC_BASE_URL: 'https://media.test' }),
    {} as TutorialDesk,
  );
}

const NEW: Shop = {
  live: ['01-shop-setup', '02-categories', '03-add-product', '04-share-links', '07-steadfast'],
  owner: 'owner',
  order: false,
  dismissed: [],
  watched: [],
};

describe("Home's tutorial head (§7.49a)", () => {
  it('shows the next video large for a new shop, and one line once the four are watched', async () => {
    expect(await libraryOf(NEW).homeHead('t', false)).toBe(TutorialsHead.Full);
    const half = { ...NEW, watched: ['01-shop-setup', '02-categories'] };
    expect(await libraryOf(half).homeHead('t', false)).toBe(TutorialsHead.Full);
    const done = {
      ...NEW,
      watched: ['01-shop-setup', '02-categories', '03-add-product', '04-share-links'],
    };
    expect(await libraryOf(done).homeHead('t', false)).toBe(TutorialsHead.Small);
  });

  it('counts only the four that have a file', async () => {
    const two = { ...NEW, live: ['02-categories', '03-add-product'], watched: ['03-add-product'] };
    expect(await libraryOf(two).homeHead('t', false)).toBe(TutorialsHead.Full);
    expect(
      await libraryOf({ ...two, watched: ['02-categories', '03-add-product'] }).homeHead(
        't',
        false,
      ),
    ).toBe(TutorialsHead.Small);
  });

  it('goes at the first of: the card folded, the first order, "আর দেখাবেন না"', async () => {
    expect(await libraryOf(NEW).homeHead('t', true)).toBe(null);
    expect(await libraryOf({ ...NEW, order: true }).homeHead('t', false)).toBe(null);
    expect(await libraryOf({ ...NEW, dismissed: [TutorialScreen.Home] }).homeHead('t', false)).toBe(
      null,
    );
    // Hiding another screen's row leaves Home's.
    expect(
      await libraryOf({ ...NEW, dismissed: [TutorialScreen.Products] }).homeHead('t', false),
    ).toBe(TutorialsHead.Full);
  });

  it('has nothing to show while none of the four has a file', async () => {
    expect(await libraryOf({ ...NEW, live: ['07-steadfast'] }).homeHead('t', false)).toBe(null);
    expect(await libraryOf({ ...NEW, owner: null }).homeHead('t', false)).toBe(null);
  });
});
