import { Injectable, Logger } from '@nestjs/common';
import type { MediaFailureNotice, MediaNotifier } from '../ports/media-notifier';

/**
 * STO-09, D3-5: the stand-in until Phase 7's notification module delivers in-app and push notices. It only logs; which
 * failures are told is the processing job's and the nightly run's decision, and that is what the tests prove.
 */
@Injectable()
export class ConsoleMediaNotifier implements MediaNotifier {
  private readonly logger = new Logger('Media');

  mediaFailed(notice: MediaFailureNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: ${notice.kind} ${notice.mediaId} (${notice.purpose}) was refused: ${notice.failure}`,
    );
    return Promise.resolve();
  }
}
