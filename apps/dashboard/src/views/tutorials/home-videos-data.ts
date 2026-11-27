import {
  TUTORIAL_HOME_FOUR,
  TutorialScreen,
  tutorialPartOf,
  type TutorialPart,
  type TutorialVideoView,
} from '@lytronix/validators';
import { useTutorials } from '@/api/tutorials';

/** One of Home's four, with its file and whether the owner watched it. */
export interface Four {
  part: TutorialPart;
  video: TutorialVideoView;
  watched: boolean;
}

/**
 * §7.49a: Home's videos, while the server says the head shows (the owner, the card open, no order yet) and the owner has
 * not said "আর দেখাবেন না" here: the four that have a file, in order. Null when there is no head.
 */
export function useHomeVideos(head: string | null): Four[] | null {
  const tutorials = useTutorials({ enabled: head !== null });
  const data = tutorials.data;
  if (head === null || !data || data.dismissed.includes(TutorialScreen.Home)) return null;
  const four = TUTORIAL_HOME_FOUR.flatMap((key) => {
    const item = data.parts.find((each) => each.key === key);
    const part = tutorialPartOf(key);
    return item?.video && part ? [{ part, video: item.video, watched: item.watched }] : [];
  });
  return four.length > 0 ? four : null;
}
