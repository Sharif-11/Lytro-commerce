import { Inject, Injectable } from '@nestjs/common';
import { TUTORIAL_OLD_FILE_DAYS } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';
import type { MediaStorage } from '../../media/ports/media-storage';
import { MEDIA_STORAGE } from '../../media/tokens';
import type { TutorialStore } from '../ports/tutorial-store';
import { TUTORIAL_CLOCK, TUTORIAL_STORE } from '../tokens';

// An upload that claimed its version and never went live (its process stopped midway) is left a day, then retired.
const UNFINISHED_AFTER_MS = DAY_MS;
const BATCH = 100;

/**
 * OPERATOR-CONSOLE-DESIGN §10h: the nightly job. A tutorial file replaced or removed 7 days ago is deleted from the public
 * media bucket -- by then nobody is still watching it -- and its row kept, so the next upload's name still moves on. A
 * store that is away throws, so the job tries again; deleting what is already gone is not an error.
 */
@Injectable()
export class TutorialFileSweep {
  constructor(
    @Inject(TUTORIAL_STORE) private readonly store: TutorialStore,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(TUTORIAL_CLOCK) private readonly clock: () => Date,
  ) {}

  /** How many old versions' files were deleted. */
  async run(): Promise<number> {
    const now = this.clock();
    await this.store.run((tx) =>
      this.store.retireUnfinished(tx, new Date(now.getTime() - UNFINISHED_AFTER_MS), now),
    );
    const before = new Date(now.getTime() - TUTORIAL_OLD_FILE_DAYS * DAY_MS);
    let deleted = 0;
    for (;;) {
      const due = await this.store.oldFiles(before, BATCH);
      if (due.length === 0) return deleted;
      await this.storage.deleteMedia(due.flatMap((row) => [row.videoKey, row.coverKey]));
      await this.store.run((tx) =>
        this.store.markFilesDeleted(
          tx,
          due.map((row) => row.id),
          now,
        ),
      );
      deleted += due.length;
      if (due.length < BATCH) return deleted;
    }
  }
}
