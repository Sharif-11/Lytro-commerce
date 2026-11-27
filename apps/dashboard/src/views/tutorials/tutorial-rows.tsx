import { useTranslation } from 'react-i18next';
import {
  TUTORIAL_IN_CARD_SCREENS,
  tutorialPartsOn,
  type TutorialItemView,
  type TutorialPart,
  type TutorialScreen,
} from '@lytronix/validators';
import { useDismissTutorials, useTutorials } from '@/api/tutorials';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { useShell } from '@/shell/shell-context';
import { usePlayTutorial } from './player-hook';
import { lengthOf, wordsIn } from './words';

/** A part with its live file, as a row draws it. */
interface Playable {
  part: TutorialPart;
  item: TutorialItemView & { video: NonNullable<TutorialItemView['video']> };
}

/** The parts on a screen that have a file, in the series' order; no file, no row (§7.49). */
function usePlayable(screen: TutorialScreen): { playable: Playable[]; dismissed: boolean } {
  const tutorials = useTutorials();
  const data = tutorials.data;
  if (!data) return { playable: [], dismissed: false };
  const playable = tutorialPartsOn(screen).flatMap((part) => {
    const item = data.parts.find((each) => each.key === part.key);
    return item?.video ? [{ part, item: { ...item, video: item.video } }] : [];
  });
  return { playable, dismissed: data.dismissed.includes(screen) };
}

/** "আর দেখাবেন না" on a screen: hidden for this person on every device, with the toast saying where the videos are. */
function useDismiss(screen: TutorialScreen): () => void {
  const { t } = useTranslation('tutorials');
  const { showToast } = useShell();
  const dismiss = useDismissTutorials();
  return () => {
    dismiss.mutate(screen);
    showToast(t('dismissed'));
  };
}

/**
 * One video's row (the prototype's `.tv-row`): a round play button, "ভিডিও দেখুন: কীভাবে …", and under it the part, its
 * length and, on a screen, "আর দেখাবেন না". Tapping anywhere but the dismiss opens the player. Inside a card or a sheet
 * it sits on white, without the dismiss (`.tv-in`).
 */
function TutorialRow({
  playable,
  inCard = false,
  onDismiss,
}: {
  playable: Playable;
  inCard?: boolean;
  onDismiss?: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('tutorials');
  const language = i18n.language;
  const play = usePlayTutorial();
  const { part, item } = playable;
  const open = () => {
    play(part.key);
  };
  return (
    <div
      data-tutorial={part.key}
      onClick={open}
      className={[
        'flex w-full cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left text-fg',
        inCard ? 'my-2.5 border-line bg-surface' : 'mb-3 border-brand-200 bg-primary-soft',
      ].join(' ')}
    >
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-primary text-on-primary">
        <Icon name="play" size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            open();
          }}
          className="text-left text-[15px] leading-[1.35] font-semibold"
        >
          {t('watch')}: {wordsIn(part.how, language)}
        </button>
        <span className="text-[13px] text-fg-muted">
          {t('part', { n: wordsIn(part.part, language) })} ·{' '}
          {lengthOf(item.video.durationSeconds, language)}
          {onDismiss ? (
            <>
              {' · '}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss();
                }}
                className="cursor-pointer text-[13px] text-fg-muted underline"
              >
                {t('dontShow')}
              </button>
            </>
          ) : null}
        </span>
      </span>
      <Icon name="right" className="flex-none text-fg-muted" />
    </div>
  );
}

/**
 * The rows right under a screen's title (§7.49), one for each of its parts that has a file, each with "আর দেখাবেন না",
 * which hides them all on this screen for this person. None while the person hid them, or no part has a file.
 */
export function ScreenTutorials({ screen }: { screen: TutorialScreen }): React.JSX.Element | null {
  const { playable, dismissed } = usePlayable(screen);
  const onDismiss = useDismiss(screen);
  if (dismissed || playable.length === 0) return null;
  return (
    <div className="flex flex-col">
      {playable.map((each) => (
        <TutorialRow key={each.part.key} playable={each} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * The row inside a card or a sheet (§7.49: the share sheet, Shop details' shop link card): on white and without "আর
 * দেখাবেন না" -- the card has its own job -- and gone once the person has watched the video (the owner's pick).
 */
export function InCardTutorial({ screen }: { screen: TutorialScreen }): React.JSX.Element | null {
  const { playable } = usePlayable(screen);
  if (!TUTORIAL_IN_CARD_SCREENS.includes(screen)) return null;
  const shown = playable.filter((each) => !each.item.watched);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((each) => (
        <TutorialRow key={each.part.key} playable={each} inCard />
      ))}
    </>
  );
}

/**
 * A page with more than one video (§7.49, the prototype's `tv-meta`: বিজ্ঞাপন ও ফিড, parts 5, 6ক and 6খ): one card, "এই
 * পেজের ভিডিও", a row for each part that has a file and one "আর দেখাবেন না" for the card.
 */
export function TutorialsCard({ screen }: { screen: TutorialScreen }): React.JSX.Element | null {
  const { t } = useTranslation('tutorials');
  const { playable, dismissed } = usePlayable(screen);
  const onDismiss = useDismiss(screen);
  if (dismissed || playable.length === 0) return null;
  return (
    <Card className="mb-3 !px-4 !py-3">
      <div className="flex items-center justify-between gap-3">
        <b>{t('cardTitle')}</b>
        <button
          type="button"
          onClick={onDismiss}
          className="cursor-pointer text-[13px] text-fg-muted underline"
        >
          {t('dontShow')}
        </button>
      </div>
      <div className="[&>*:last-child]:mb-0">
        {playable.map((each) => (
          <TutorialRow key={each.part.key} playable={each} inCard />
        ))}
      </div>
    </Card>
  );
}
