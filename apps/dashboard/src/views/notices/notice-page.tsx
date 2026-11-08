import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { errorMessage } from '@lytronix/api-client';
import { ErrorBanner } from '@lytronix/ui';
import { useAcknowledgeNotice, useMarkNoticeRead, useNotice } from '@/api/notices';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { formatShortDay, formatTime } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { NoticeView } from '@/types/notices';
import { SeverityTag } from './board';
import { CATEGORY_WORD, useMinuteClock } from './notice-words';

// An https link's "opens elsewhere" mark, drawn into the server's HTML after it renders (the CSP allows no data: images).
const EXTERNAL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

/**
 * A notice's body as the server rendered it (NTC-16, D7-53): every character escaped first, then paragraphs, bold,
 * "- " lists and https links opening a new tab without the referrer. It is the server's own safe HTML, set as is.
 */
function NoticeBody({ html }: { html: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const link of ref.current?.querySelectorAll('a') ?? []) {
      if (!link.querySelector('svg')) link.insertAdjacentHTML('beforeend', EXTERNAL);
    }
  }, [html]);
  return (
    <div ref={ref} dir="auto" className="notice-body" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** A maintenance window's countdown (Part 37's `.p37cd`): days, hours and minutes to its start, or under way. */
function Countdown({ notice }: { notice: NoticeView }): React.JSX.Element | null {
  const { t, i18n } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const now = useMinuteClock();
  if (!notice.windowStartsAt || !notice.windowEndsAt) return null;
  const starts = Date.parse(notice.windowStartsAt);
  const ends = Date.parse(notice.windowEndsAt);
  if (ends <= now) return null;
  if (starts <= now) {
    return (
      <Card>
        <h3 className="text-[16px] font-semibold">{shell('p37MaintIn')}</h3>
        <p className="mt-1 text-[14px] text-fg-muted">
          {shell('p37MaintNow', { e: formatTime(notice.windowEndsAt, i18n.language) })}
        </p>
      </Card>
    );
  }
  const minutes = Math.round((starts - now) / 60_000);
  const parts: [number, string][] = [
    [Math.floor(minutes / 1440), t('p37CdDays')],
    [Math.floor((minutes % 1440) / 60), t('p37CdHours')],
    [minutes % 60, t('p37CdMins')],
  ];
  return (
    <Card>
      <h3 className="text-[16px] font-semibold">{t('p37CdLead')}</h3>
      <div className="num mt-1 grid grid-cols-3 gap-2">
        {parts.map(([value, label]) => (
          <div
            key={label}
            className="rounded-[8px] border border-line bg-neutral-50 p-2 text-center"
          >
            <b className="block text-[22px] tabular-nums">{value}</b>
            <span className="text-[12px] text-neutral-700">{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** When something happened, as a notice says it: "7 Nov, 3:20 pm". */
function stamp(iso: string, language: string): string {
  return `${formatShortDay(iso, language)}, ${formatTime(iso, language)}`;
}

/**
 * One notice (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-notice`; NTC-05, NTC-08, NTC-14, NTC-15): From Lytro, its
 * category and severity, published and updated, the countdown for maintenance, the body, and, when it asks, the owner's
 * "I understand" once for the shop. Staff see who must press it, or that the owner did. Opening it reads it.
 */
export function NoticePage({ id }: { id: string }): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const { viewer, tenant, showToast } = useShell();
  const notice = useNotice(id);
  const read = useMarkNoticeRead();
  const acknowledge = useAcknowledgeNotice();
  const markedRead = useRef(false);
  const found = notice.data;

  useEffect(() => {
    if (!found || found.read || markedRead.current) return;
    markedRead.current = true;
    read.mutate(found.id);
  }, [found, read]);

  if (notice.isLoading) {
    return (
      <ShellPage title={shell('secNotices')}>
        <Card flush>
          <SkeletonRows count={3} />
        </Card>
      </ShellPage>
    );
  }
  if (!found) {
    return (
      <ShellPage title={shell('secNotices')}>
        <ErrorBanner message={errorMessage(notice.error, t)} />
      </ShellPage>
    );
  }
  const owner = viewer.isOwner;
  const archived = tenant.state === TenantState.Archived;
  const other = found.language !== (i18n.language === 'en' ? 'en' : 'bn');
  let ackBanner: React.JSX.Element | null = null;
  if (found.requiresAck) {
    if (found.acknowledgedAt) {
      const when = stamp(found.acknowledgedAt, i18n.language);
      ackBanner = (
        <Banner tone="info">
          {owner ? t('p37AckDone', { d: when }) : t('p37AckStaffDone', { d: when })}
        </Banner>
      );
    } else {
      ackBanner = owner ? (
        <Banner tone="warn">{t('p37AckAsk')}</Banner>
      ) : (
        <Banner tone="neutral">{t('p37AckStaff')}</Banner>
      );
    }
  }
  return (
    <ShellPage title={null}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-700">
          <span>{shell('p37BellLytro')}</span> · <span>{shell(CATEGORY_WORD[found.category])}</span>
          <SeverityTag notice={found} />
          {found.pinned ? (
            <span className="inline-flex items-center gap-0.5">
              <Icon name="pushpin" size={13} /> {t('pinned')}
            </span>
          ) : null}
        </div>
        <h1 dir="auto" className="text-[22px] leading-[1.35] font-bold">
          {found.title}
        </h1>
        <div className="num flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-700">
          <span>{t('p37Published', { d: formatShortDay(found.publishedAt, i18n.language) })}</span>
          {found.editedAt ? (
            <span>
              · <b>{t('p37UpdatedLong', { d: formatShortDay(found.editedAt, i18n.language) })}</b>
            </span>
          ) : null}
        </div>
      </div>
      {other ? (
        <Banner tone="neutral">{found.language === 'en' ? t('p37OnlyEn') : t('p37OnlyBn')}</Banner>
      ) : null}
      {ackBanner}
      <Countdown notice={found} />
      <Card>
        <NoticeBody html={found.html} />
      </Card>
      {found.requiresAck && !found.acknowledgedAt && owner && !archived ? (
        <ActionBar>
          <Button
            busy={acknowledge.isPending}
            onClick={() => {
              acknowledge.mutate(found.id, {
                onSuccess: () => {
                  showToast(t('p37AckToast'));
                },
                onError: (error) => {
                  showToast(errorMessage(error, t));
                },
              });
            }}
          >
            {t('understand')}
          </Button>
        </ActionBar>
      ) : null}
    </ShellPage>
  );
}
