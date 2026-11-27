import { useTranslation } from 'react-i18next';
import { TUTORIAL_SERIES, type TutorialPart } from '@lytronix/validators';
import { useTutorials } from '@/api/tutorials';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RowList } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { ShellPage } from '@/shell/shell-page';
import { usePlayTutorial } from './player-hook';
import { lengthOf, wordsIn } from './words';

// The prototype's `.row.tv-li`: 84 px at least, its 9:16 cover 48 × 85.
const ROW = 'flex min-h-[84px] w-full items-center gap-3 px-4 py-3 text-left text-[inherit]';
const THUMB = 'h-[85px] w-12 flex-none rounded-[8px] bg-neutral-100 object-cover';
const LINE = 'overflow-hidden text-ellipsis whitespace-nowrap';

/**
 * Menu › টিউটোরিয়াল (TENANT-DASHBOARD-DESIGN §7.49, the prototype's `tv-list`): every part in the series' order, its
 * cover, name and length, and "✓ দেখা হয়েছে" or "নতুন". A part with no video yet is shown greyed with a clock and
 * "শিগগিরই" and does not open (the owner's pick). The page ends with the YouTube playlist, while the console has one.
 */
export function TutorialsView(): React.JSX.Element {
  const { t, i18n } = useTranslation('tutorials');
  const language = i18n.language;
  const errorText = useErrorText();
  const tutorials = useTutorials();
  const play = usePlayTutorial();
  const data = tutorials.data;

  const row = (part: TutorialPart) => {
    const item = data?.parts.find((each) => each.key === part.key);
    const title = `${t('part', { n: wordsIn(part.part, language) })} · ${wordsIn(part.name, language)}`;
    if (!item?.video) {
      return (
        <div key={part.key} className={ROW} aria-disabled="true">
          <span className={`${THUMB} flex items-center justify-center text-fg-muted`}>
            <Icon name="clock" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`${LINE} text-[16px] font-medium text-fg-muted`}>{title}</span>
            <span className={`${LINE} text-[14px] text-fg-muted`}>{t('soon')}</span>
          </span>
        </div>
      );
    }
    return (
      <button
        key={part.key}
        type="button"
        className={ROW}
        onClick={() => {
          play(part.key);
        }}
      >
        <img src={item.video.coverUrl} alt="" className={THUMB} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`${LINE} text-[16px] font-medium`}>{title}</span>
          <span className={`${LINE} text-[14px] text-fg-muted`}>
            {lengthOf(item.video.durationSeconds, language)} ·{' '}
            {item.watched ? (
              <span className="inline-flex items-center gap-[3px] font-semibold text-success">
                <Icon name="check" size={14} />
                {t('watched')}
              </span>
            ) : (
              <StatusTag tone="info">{t('new')}</StatusTag>
            )}
          </span>
        </span>
        <Icon name="play" />
      </button>
    );
  };

  return (
    <ShellPage title={t('title')}>
      <p className="mb-3 text-[14px]">{t('lead')}</p>
      {tutorials.isError ? (
        <Banner
          tone="bad"
          action={
            <Button
              tone="ghost"
              size="xs"
              onClick={() => {
                void tutorials.refetch();
              }}
            >
              {t('retry')}
            </Button>
          }
        >
          {errorText(tutorials.error)}
        </Banner>
      ) : null}
      <Card flush>
        <RowList>{TUTORIAL_SERIES.map(row)}</RowList>
      </Card>
      {data?.playlistUrl ? (
        <a
          href={data.playlistUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-0.5 mt-3.5 mb-1 inline-flex items-center gap-1.5 self-start text-[15px] font-semibold text-primary no-underline"
        >
          <Icon name="external" size={16} />
          {t('youtube')}
        </a>
      ) : null}
    </ShellPage>
  );
}
