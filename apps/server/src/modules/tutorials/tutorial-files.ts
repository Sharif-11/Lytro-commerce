import { tutorialPartOf, type TutorialKey, type TutorialPart } from '@lytronix/validators';
import { ApiError } from '../../common/api-error';

/**
 * OPERATOR-CONSOLE-DESIGN §10h: Lytro's own prefix in the public media bucket, outside every shop's `tenants/<id>/`, so a
 * shop's deletion, the nightly reconciliation and the media-cost report's shop totals never reach these files.
 */
export const TUTORIAL_PREFIX = 'platform/tutorials/';

/** The prefix of the temporary uploads a part's next file arrives under. */
export function tutorialUploadPrefix(key: TutorialKey): string {
  return `tutorials/${key}/`;
}

/**
 * The one place a tutorial's stored names are made: `platform/tutorials/03-add-product-v2.mp4` and its cover beside it,
 * `-v2.jpg`. Each version has its own name, because media.lytro.app tells Cloudflare and phones to keep a file a year.
 */
export function tutorialFileKeys(
  key: TutorialKey,
  version: number,
): { videoKey: string; coverKey: string } {
  const stem = `${TUTORIAL_PREFIX}${key}-v${String(version)}`;
  return { videoKey: `${stem}.mp4`, coverKey: `${stem}.jpg` };
}

/** A part named by the path; a key that is not in the series is a page that isn't there. */
export function tutorialPartFrom(key: string): TutorialPart {
  const part = tutorialPartOf(key);
  if (!part) throw new ApiError('not_found', 'PageNotFound', {});
  return part;
}
