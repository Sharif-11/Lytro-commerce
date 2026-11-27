import { Inject, Injectable } from '@nestjs/common';
import type { SelectTutorialVideo, Transaction } from '@lytronix/db';
import {
  TUTORIAL_HOME_FOUR,
  TUTORIAL_SERIES,
  TutorialScreen,
  TutorialsHead,
  type TutorialVideoView,
  type TutorialsView,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { MediaLinks } from '../../../common/media-links';
import type { TutorialStore } from '../ports/tutorial-store';
import { TUTORIAL_STORE } from '../tokens';
import { tutorialPartFrom } from '../tutorial-files';
import { TutorialDesk } from './tutorial-desk';

const KNOWN_SCREENS: ReadonlySet<string> = new Set(Object.values(TutorialScreen));

/** A shop person: the shop the session names, and their own staff row there (null while acting as the owner). */
export interface TutorialPerson {
  tenantId: string;
  sessionUserId: string | null;
}

/**
 * TENANT-DASHBOARD-DESIGN §7.49, §7.49a: the tutorials as a shop person sees them -- the series with each part's live
 * file, which they watched, the screens they hid the videos on and the playlist link; marking one watched, hiding a
 * screen's; and the head of Home's set-up card. Each person's own, never the shop's: the owner and every staff member
 * decide for themselves.
 */
@Injectable()
export class TutorialLibrary {
  constructor(
    @Inject(TUTORIAL_STORE) private readonly store: TutorialStore,
    @Inject(MediaLinks) private readonly links: MediaLinks,
    @Inject(TutorialDesk) private readonly desk: TutorialDesk,
  ) {}

  async view(person: TutorialPerson): Promise<TutorialsView> {
    const [live, playlistUrl, mine] = await Promise.all([
      this.store.live(),
      this.desk.playlist(),
      this.store.inShop(person.tenantId, async (tx) => {
        const userId = await this.userOf(tx, person);
        // In turn: the transaction's one connection runs one query at a time.
        const watched = await this.store.watched(tx, person.tenantId, userId);
        const dismissed = await this.store.dismissed(tx, person.tenantId, userId);
        return { watched, dismissed };
      }),
    ]);
    return {
      parts: TUTORIAL_SERIES.map((part) => {
        const row = live.find((each) => each.tutorialKey === part.key);
        return {
          key: part.key,
          video: row ? this.videoOf(row) : null,
          watched: mine.watched.includes(part.key),
        };
      }),
      // A screen a later release added is left out, so this one's answer still reads.
      dismissed: mine.dismissed.filter((screen) => KNOWN_SCREENS.has(screen)),
      playlistUrl,
    };
  }

  /** §7.49: played to the end, or past 90 percent. The first time counts; a replaced video keeps it. */
  async markWatched(person: TutorialPerson, key: string): Promise<void> {
    const part = tutorialPartFrom(key);
    await this.store.inShop(person.tenantId, async (tx) => {
      await this.store.markWatched(tx, person.tenantId, await this.userOf(tx, person), part.key);
    });
  }

  /** §7.49, §7.49a: "আর দেখাবেন না" on a screen, or Home's head, for this person, on every device. */
  async dismiss(person: TutorialPerson, screen: TutorialScreen): Promise<void> {
    await this.store.inShop(person.tenantId, async (tx) => {
      await this.store.dismiss(tx, person.tenantId, await this.userOf(tx, person), screen);
    });
  }

  /**
   * §7.49a: the head of Home's set-up card, the owner's alone, while the card is open and the shop has had no order: the
   * next video large until the four (those with a file) are watched, then one line; none once the owner said "আর
   * দেখাবেন না", the card folded, the shop's first order came, or none of the four has a file yet.
   */
  async homeHead(tenantId: string, cardFolded: boolean): Promise<TutorialsHead | null> {
    if (cardFolded) return null;
    const live = await this.store.live();
    const four = TUTORIAL_HOME_FOUR.filter((key) => live.some((row) => row.tutorialKey === key));
    if (four.length === 0) return null;
    return this.store.inShop(tenantId, async (tx) => {
      const owner = await this.store.ownerUserId(tx, tenantId);
      if (owner === null) return null;
      if (await this.store.hasOrder(tx, tenantId)) return null;
      if ((await this.store.dismissed(tx, tenantId, owner)).includes(TutorialScreen.Home)) {
        return null;
      }
      const watched = await this.store.watched(tx, tenantId, owner);
      return four.every((key) => watched.includes(key)) ? TutorialsHead.Small : TutorialsHead.Full;
    });
  }

  private videoOf(row: SelectTutorialVideo): TutorialVideoView {
    return {
      url: this.links.url(row.videoKey),
      coverUrl: this.links.url(row.coverKey),
      durationSeconds: row.durationSeconds,
      version: row.version,
    };
  }

  private async userOf(tx: Transaction, person: TutorialPerson): Promise<string> {
    if (person.sessionUserId !== null) return person.sessionUserId;
    const owner = await this.store.ownerUserId(tx, person.tenantId);
    if (owner === null) throw new ApiError('not_found', 'PageNotFound', {});
    return owner;
  }
}
