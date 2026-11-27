import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { TutorialScreen, type TutorialKey, type TutorialPart } from '@lytronix/validators';
import { useDismissTutorials, useTutorials } from '@/api/tutorials';
import { Icon } from '@/components/icon';
import { useShell } from '@/shell/shell-context';
import type { Four } from './home-videos-data';
import { usePlayTutorial } from './player-hook';
import { digitsFor, lengthOf, wordsIn } from './words';

/** The step's "▶ ভিডিও · ৩:১২" chip (the prototype's `.tvh-chip`): it plays the video; the row still opens the step. */
export function StepVideoChip({
  tutorialKey,
  four,
}: {
  tutorialKey: TutorialKey;
  four: Four[] | null;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('tutorials');
  const tutorials = useTutorials({ enabled: four !== null });
  const play = usePlayTutorial();
  const video = tutorials.data?.parts.find((each) => each.key === tutorialKey)?.video;
  if (four === null || !video) return null;
  const open = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    play(tutorialKey);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') open(event);
      }}
      className="mt-[5px] inline-flex cursor-pointer items-center gap-1 self-start rounded-full border border-brand-200 bg-primary-soft py-0.5 pr-2.5 pl-2 text-[13px] font-semibold text-brand-700 [&_svg]:size-3"
    >
      <Icon name="play" size={12} />
      {t('chip', { length: lengthOf(video.durationSeconds, i18n.language) })}
    </span>
  );
}

/**
 * The head of Home's set-up card (TENANT-DASHBOARD-DESIGN §7.49a, the prototype's `tv-home-new`, `tv-home-half`,
 * `tv-home-done`): "ভিডিও দেখে শুরু করুন" with how many are watched and four segments; the next video large ("প্রথমে এই
 * ভিডিওটা দেখুন", then "এরপর …"), the four in order with ✓, "সব টিউটোরিয়াল" and "আর দেখাবেন না". Once all four are
 * watched it shrinks to one line. On a computer the next video and the list sit side by side.
 */
export function HomeVideosHead({ four }: { four: Four[] }): React.JSX.Element {
  const { t, i18n } = useTranslation('tutorials');
  const language = i18n.language;
  const { slug, showToast } = useShell();
  const play = usePlayTutorial();
  const dismiss = useDismissTutorials();
  const watched = four.filter((each) => each.watched).length;
  const all = (
    <Link
      to="/$shop/tutorials"
      params={{ shop: slug }}
      className="inline-flex items-center gap-0.5 text-[14px] font-bold text-primary no-underline"
    >
      {t('all')}
      <Icon name="right" size={16} />
    </Link>
  );
  const title = (part: TutorialPart) =>
    `${t('part', { n: wordsIn(part.part, language) })} · ${wordsIn(part.name, language)}`;

  if (watched === four.length) {
    return (
      <div className="flex items-center gap-2.5 border-b border-brand-200 bg-primary-soft px-4 py-3">
        <span className="flex size-7 flex-none items-center justify-center rounded-full bg-success-soft text-success">
          <Icon name="check" size={16} />
        </span>
        <span className="min-w-0 flex-1 text-[14px] font-semibold">
          {t('headDone', { count: four.length, n: digitsFor(four.length, language) })}
        </span>
        {all}
      </div>
    );
  }

  const next = four.find((each) => !each.watched) ?? four[0];
  return (
    <div className="flex flex-col gap-2.5 border-b border-brand-200 bg-primary-soft px-4 pt-3.5 pb-2.5 lg:px-5 lg:pt-4 lg:pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[17px] font-bold">{t('headTitle')}</b>
        <span className="text-[14px] whitespace-nowrap text-fg-muted">
          {t('headCount', {
            done: digitsFor(watched, language),
            total: digitsFor(four.length, language),
          })}
        </span>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${String(four.length)}, minmax(0, 1fr))` }}
      >
        {four.map((each) => (
          <i
            key={each.part.key}
            className={`block h-1.5 rounded-[3px] ${each.watched ? 'bg-primary' : 'bg-brand-200'}`}
          />
        ))}
      </div>
      {next ? (
        <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-stretch lg:gap-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              play(next.part.key);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') play(next.part.key);
            }}
            className="flex cursor-pointer items-center gap-3.5 rounded-[12px] border border-brand-200 bg-surface p-2.5"
          >
            <span
              className="relative h-[149px] w-[84px] flex-none overflow-hidden rounded-[10px] bg-neutral-100 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url('${next.video.coverUrl}')` }}
            >
              <span className="absolute top-1/2 left-1/2 -mt-[26px] -ml-[26px] flex size-[52px] items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_4px_14px_rgba(0,0,0,.35)] [&_svg]:ml-[3px]">
                <Icon name="play" size={26} />
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[13px] font-bold text-brand-700">
                {watched > 0 ? t('nextOne') : t('first')}
              </span>
              <b className="text-[16px] leading-[1.35] font-bold">{title(next.part)}</b>
              <span className="text-[14px] text-fg-muted">
                {wordsIn(next.part.how, language)} ·{' '}
                {lengthOf(next.video.durationSeconds, language)}
              </span>
              <span className="mt-1.5">
                <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-button bg-primary px-3.5 text-[14px] font-semibold text-on-primary">
                  <Icon name="play" size={16} />
                  {t('watchVideo')}
                </span>
              </span>
            </span>
          </div>
          <div className="flex flex-col overflow-hidden rounded-[12px] border border-brand-200 bg-surface lg:justify-center">
            {four.map((each, index) => {
              const isNext = each === next;
              return (
                <button
                  key={each.part.key}
                  type="button"
                  onClick={() => {
                    play(each.part.key);
                  }}
                  className={[
                    'flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-fg',
                    index > 0 ? 'border-t border-line' : '',
                    isNext ? 'bg-brand-50' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex size-6 flex-none items-center justify-center rounded-full border-[1.5px] text-[12px] font-bold',
                      each.watched
                        ? 'border-success bg-success text-white'
                        : isNext
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-neutral-700 text-fg-muted',
                    ].join(' ')}
                  >
                    {each.watched ? (
                      <Icon name="check" size={14} />
                    ) : (
                      wordsIn(each.part.part, language)
                    )}
                  </span>
                  <span
                    className={`min-w-0 flex-1 overflow-hidden text-[15px] text-ellipsis whitespace-nowrap ${isNext ? 'font-bold' : ''}`}
                  >
                    {wordsIn(each.part.name, language)}
                  </span>
                  <span
                    className={`flex-none text-[13px] ${each.watched ? 'font-semibold text-success' : 'text-fg-muted'}`}
                  >
                    {each.watched ? t('watched') : lengthOf(each.video.durationSeconds, language)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="flex min-h-8 items-center justify-between gap-3">
        {all}
        <button
          type="button"
          onClick={() => {
            dismiss.mutate(TutorialScreen.Home);
            showToast(t('homeDismissed'));
          }}
          className="cursor-pointer text-[13px] text-fg-muted underline"
        >
          {t('dontShow')}
        </button>
      </div>
    </div>
  );
}
