import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, TextField } from '@lytronix/ui';
import {
  TUTORIAL_PLAYLIST_MAX,
  TUTORIAL_SERIES,
  isYoutubeLink,
  type OperatorTutorialView,
  type TutorialPart,
} from '@lytronix/validators';
import { useOperatorTutorials, useSavePlaylist } from '@/api/tutorials';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { FilePanel, PreviewPanel, RemovePanel } from './panels';
import { digitsFor, lengthOf, useTutorialWords } from './words';

/** One row: the part from the series, and its file from the server. */
export interface TutorialRow {
  part: TutorialPart;
  row: OperatorTutorialView;
}

type Open = { step: 'upload' | 'replace' | 'remove' | 'preview'; item: TutorialRow } | null;

// The sketch's `.tvo-th`: a 9:16 cover, 40 × 71.
const THUMB = 'h-[71px] w-10 flex-none rounded-[6px] bg-neutral-100 object-cover';
const ICON_BUTTON =
  'inline-flex size-9 flex-none items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100';

/**
 * The console's Tutorials page (OPERATOR-CONSOLE-DESIGN §10h, the sketch's `tv-tutorials`): the series in its order, 14
 * rows (part 6 is 6ক and 6খ), each with its cover, the screens it shows on and its file, its length and status, and
 * Watch, Replace and remove for a live part, Upload for one without a video; then the optional YouTube playlist link.
 * The names, the order and the screens are in code; this page only sets each part's file.
 */
export function Tutorials(): React.JSX.Element {
  const { t } = useTranslation();
  const { language, words, title } = useTutorialWords();
  const tutorials = useOperatorTutorials();
  const [open, setOpen] = useState<Open>(null);
  const data = tutorials.data;
  const rows: TutorialRow[] = data
    ? TUTORIAL_SERIES.flatMap((part) => {
        const row = data.parts.find((each) => each.key === part.key);
        return row ? [{ part, row }] : [];
      })
    : [];
  const live = rows.filter((each) => each.row.video !== null).length;
  const close = (): void => {
    setOpen(null);
  };

  const columns: Column<TutorialRow>[] = [
    {
      key: 'main',
      label: t('tutorials.cVideo'),
      width: 'minmax(0,1fr)',
      main: true,
      cell: ({ part, row }) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.video ? (
            <img src={row.video.coverUrl} alt="" className={THUMB} />
          ) : (
            <span className={`${THUMB} flex items-center justify-center text-neutral-700`}>
              <ConsoleIcon name="clock" size={18} />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <b className="text-[15px] font-semibold">{title(part)}</b>
            <span className="text-[13px] font-normal text-fg-muted">
              {t('tutorials.showsOn', { where: words(part.where) })}
            </span>
            {row.video ? (
              <span className="mono overflow-hidden text-[12px] font-normal text-ellipsis whitespace-nowrap text-fg-muted">
                {row.video.file}
              </span>
            ) : (
              <span className="text-[13px] font-normal text-fg-muted">{t('tutorials.noFile')}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'length',
      label: t('tutorials.cLength'),
      width: '72px',
      cell: ({ row }) =>
        row.video ? (
          <span className="font-semibold">{lengthOf(row.video.durationSeconds, language)}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      label: t('tutorials.cStatus'),
      width: '112px',
      cell: ({ row }) =>
        row.video ? (
          <StatusChip tone="ok">{t('tutorials.statusLive')}</StatusChip>
        ) : (
          <StatusChip tone="mute">{t('tutorials.statusNone')}</StatusChip>
        ),
    },
    {
      key: 'acts',
      label: '',
      width: '272px',
      actions: true,
      cell: (item) =>
        item.row.video ? (
          <>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={`${SMALL_BUTTON} gap-1.5`}
              onClick={() => {
                setOpen({ step: 'preview', item });
              }}
            >
              <ConsoleIcon name="play" size={16} />
              {t('tutorials.watch')}
            </Button>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={`${SMALL_BUTTON} gap-1.5`}
              onClick={() => {
                setOpen({ step: 'replace', item });
              }}
            >
              <ConsoleIcon name="upload" size={16} />
              {t('tutorials.replace')}
            </Button>
            <button
              type="button"
              title={t('tutorials.remove')}
              aria-label={`${t('tutorials.remove')}: ${title(item.part)}`}
              className={ICON_BUTTON}
              onClick={() => {
                setOpen({ step: 'remove', item });
              }}
            >
              <ConsoleIcon name="trash" />
            </button>
          </>
        ) : (
          <Button
            type="button"
            small
            fit
            className={`${SMALL_BUTTON} gap-1.5`}
            onClick={() => {
              setOpen({ step: 'upload', item });
            }}
          >
            <ConsoleIcon name="upload" size={16} />
            {t('tutorials.upload')}
          </Button>
        ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.tutorials')}
        lead={t('tutorials.lead')}
        actions={
          data ? (
            <span className="flex flex-wrap gap-2">
              <StatusChip tone="ok">
                {t('tutorials.live', { count: live, n: digitsFor(live, language) })}
              </StatusChip>
              <StatusChip tone="mute">
                {t('tutorials.none', {
                  count: rows.length - live,
                  n: digitsFor(rows.length - live, language),
                })}
              </StatusChip>
            </span>
          ) : null
        }
      />
      {tutorials.isError ? (
        <LoadFailed
          onRetry={() => {
            void tutorials.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(item) => item.part.key}
          loading={tutorials.isPending}
          empty={null}
        />
      )}
      {data ? <PlaylistCard saved={data.playlistUrl} /> : null}
      {open?.step === 'upload' || open?.step === 'replace' ? (
        <FilePanel item={open.item} replace={open.step === 'replace'} onClose={close} />
      ) : null}
      {open?.step === 'remove' ? <RemovePanel item={open.item} onClose={close} /> : null}
      {open?.step === 'preview' ? <PreviewPanel item={open.item} onClose={close} /> : null}
    </ConsolePage>
  );
}

/** §10h: the optional playlist link at the end of the sellers' Menu › Tutorials. */
function PlaylistCard({ saved }: { saved: string | null }): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSavePlaylist();
  const [value, setValue] = useState(saved ?? '');
  useEffect(() => {
    setValue(saved ?? '');
  }, [saved]);
  const typed = value.trim();
  const bad = typed.length > 0 && !isYoutubeLink(typed);
  return (
    <ConsoleCard>
      <form
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (bad) return;
          save.mutate(typed.length > 0 ? typed : null, {
            onSuccess: (answer) => {
              toast(
                answer.playlistUrl ? t('tutorials.playlistSaved') : t('tutorials.playlistCleared'),
              );
            },
          });
        }}
      >
        <h3 className="flex items-center gap-2 text-[16px] font-semibold">
          {t('tutorials.playlistTitle')}
          <span className="rounded-[6px] border border-line-strong px-1.5 text-[12px] font-semibold text-fg-muted">
            {t('tutorials.optional')}
          </span>
        </h3>
        <div className="mt-3">
          <TextField
            label={t('tutorials.playlistLabel')}
            name="playlistUrl"
            mono
            value={value}
            maxLength={TUTORIAL_PLAYLIST_MAX}
            inputMode="url"
            onChange={(event) => {
              setValue(event.target.value);
            }}
            error={
              bad
                ? t('tutorials.playlistBad')
                : save.isError
                  ? errorMessage(save.error, t)
                  : undefined
            }
            hint={t('tutorials.playlistHelp')}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="submit" small fit loading={save.isPending} disabled={bad}>
            {t('tutorials.save')}
          </Button>
        </div>
      </form>
    </ConsoleCard>
  );
}
