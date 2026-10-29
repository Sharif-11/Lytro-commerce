import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActivityList } from '@/api/activity';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { dayLabel, formatDayMonthYear, formatTime, groupByDay } from '@/lib/dates';
import { initialOf } from '@/lib/initial';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ActivityEntry } from '@/types/activity';
import {
  ACTIVITY_CHIPS,
  actorOf,
  detailOf,
  filterOf,
  isFailure,
  sentenceOf,
  type ActivityChip,
} from './activity-words';

/**
 * Activity (TENANT-DASHBOARD-DESIGN §7.15, the prototype's `activity` and Part 11's empty states): the chips, filtered on
 * the server; a timeline by day, one sentence an entry with what it was about, the result only on a failure; Show
 * earlier; and how long the plan keeps it (AUD-04, AUD-06, AUD-08).
 */
export function ActivityView(): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const errorText = useErrorText();
  const { tenant } = useShell();
  const [chip, setChip] = useState<ActivityChip>('all');
  const list = useActivityList(filterOf(chip));
  const pages = list.data?.pages ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const retentionDays = pages[0]?.retentionDays;

  function heading(iso: string): string {
    const label = dayLabel(iso);
    if (label.kind === 'today') return t('dayToday');
    if (label.kind === 'yesterday') return t('dayYesterday');
    return formatDayMonthYear(label.iso);
  }

  return (
    <ShellPage>
      <ChipRow role="group">
        {ACTIVITY_CHIPS.map((each) => (
          <Chip
            key={each.chip}
            on={chip === each.chip}
            onClick={() => {
              setChip(each.chip);
            }}
          >
            {t(each.label)}
          </Chip>
        ))}
      </ChipRow>
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {list.isSuccess ? (
        <Card flush>
          {entries.length === 0 ? (
            <EmptyState
              icon={chip === 'all' ? 'activity' : 'check'}
              action={
                chip === 'all' ? undefined : (
                  <Button
                    tone="outline"
                    size="sm"
                    onClick={() => {
                      setChip('all');
                    }}
                  >
                    {t('actShowAll')}
                  </Button>
                )
              }
            >
              {chip === 'all'
                ? t('actEmpty')
                : chip === 'failed'
                  ? t('actFailedEmpty')
                  : t('actFilterEmpty')}
            </EmptyState>
          ) : (
            groupByDay(entries, (entry) => entry.createdAt).map((group) => (
              <div key={group.key}>
                <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
                  {heading(group.iso)}
                </div>
                <div className="flex flex-col px-4 pt-1 pb-2">
                  {group.items.map((entry) => (
                    <ActivityRow key={entry.id} entry={entry} language={i18n.language} />
                  ))}
                </div>
              </div>
            ))
          )}
        </Card>
      ) : null}
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('showEarlier')}
        </Button>
      ) : null}
      {retentionDays ? (
        <p className="text-[14px] text-fg-muted">
          {t('retention', { plan: tenant.planName ?? '', days: retentionDays })}
        </p>
      ) : null}
    </ShellPage>
  );
}

/** One entry (the prototype's `act`): the actor's initial, or "!" on a failure; the sentence; the time. */
function ActivityRow({
  entry,
  language,
}: {
  entry: ActivityEntry;
  language: string;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const failed = isFailure(entry);
  const detail = detailOf(entry);
  return (
    <div className="relative grid grid-cols-[28px_1fr_auto] gap-x-3 py-1.5 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-[18px] [&:not(:last-child)]:before:-bottom-2 [&:not(:last-child)]:before:left-[9px] [&:not(:last-child)]:before:w-0.5 [&:not(:last-child)]:before:bg-neutral-100 [&:not(:last-child)]:before:content-['']">
      <span
        aria-hidden="true"
        className={[
          'flex size-7 items-center justify-center rounded-full text-[12px] font-semibold',
          failed ? 'bg-danger-soft text-danger' : 'bg-brand-100 text-primary-text',
        ].join(' ')}
      >
        {failed ? '!' : initialOf(actorOf(entry, t))}
      </span>
      <span className="text-[15px]">
        {sentenceOf(entry, t)}
        {failed ? (
          <>
            {' '}
            <StatusTag tone="bad">{t('failed')}</StatusTag>
          </>
        ) : null}
        {detail ? <small className="block text-[13px] text-fg-muted">{detail}</small> : null}
      </span>
      <span className="num text-[13px] whitespace-nowrap text-fg-subtle">
        {formatTime(entry.createdAt, language)}
      </span>
    </div>
  );
}
