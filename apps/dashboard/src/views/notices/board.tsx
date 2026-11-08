import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { NoticeCategory, noticePlainText, NoticeSeverity, TenantState } from '@lytronix/validators';
import { useNoticeBoard } from '@/api/notices';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { formatShortDay } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { NoticeView } from '@/types/notices';
import { CATEGORY_WORD, severityTone } from './notice-words';

const CATEGORIES = Object.values(NoticeCategory);

/** Its severity's tag, for an important or urgent notice. */
export function SeverityTag({
  notice,
}: {
  notice: Pick<NoticeView, 'severity'>;
}): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const tone = severityTone(notice.severity);
  if (!tone) return null;
  return (
    <StatusTag tone={tone} small>
      {t(tone === 'bad' ? 'p37SevUrgent' : 'p37SevImportant')}
    </StatusTag>
  );
}

/**
 * One notice on the board (Part 37's `.nb37row`): its severity's edge, Pinned, its category and severity, "Updated",
 * "I understand" to press or pressed, its title and two lines, its day, and an unread dot.
 */
function NoticeRow({ notice }: { notice: NoticeView }): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const { slug, viewer } = useShell();
  const unread = !notice.read;
  const edge =
    notice.severity === NoticeSeverity.Urgent
      ? 'bg-danger'
      : notice.severity === NoticeSeverity.Important
        ? 'bg-accent'
        : 'bg-neutral-200';
  return (
    <Link
      to="/$shop/notices/$noticeId"
      params={{ shop: slug, noticeId: notice.id }}
      className="relative flex w-full items-start gap-3 px-4 py-3.5 text-left text-[inherit] no-underline"
    >
      <span className={`w-1 flex-none self-stretch rounded-full ${edge}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-700">
          {notice.pinned ? (
            <span className="inline-flex items-center gap-0.5">
              <Icon name="pushpin" size={13} /> {t('pinned')} ·
            </span>
          ) : null}
          <span>{shell(CATEGORY_WORD[notice.category])}</span>
          <SeverityTag notice={notice} />
          {notice.editedAt ? (
            <span>· {t('p37Updated', { d: formatShortDay(notice.editedAt, i18n.language) })}</span>
          ) : null}
          {notice.requiresAck ? (
            notice.acknowledgedAt ? (
              <StatusTag tone="ok" small>
                {t('p37Acked', { d: formatShortDay(notice.acknowledgedAt, i18n.language) })}
              </StatusTag>
            ) : viewer.isOwner ? (
              <StatusTag tone="warn" small>
                {t('p37NeedsAck')}
              </StatusTag>
            ) : null
          ) : null}
        </span>
        <span
          dir="auto"
          className={`text-[16px] leading-[1.4] ${unread ? 'font-bold' : 'font-medium'}`}
        >
          {notice.title}
        </span>
        <span dir="auto" className="line-clamp-2 text-[14px] leading-[1.5] text-fg-muted">
          {noticePlainText(notice.body)}
        </span>
      </span>
      <span className="num flex-none pt-0.5 text-[12px] whitespace-nowrap text-neutral-700">
        {formatShortDay(notice.publishedAt, i18n.language)}
      </span>
      {unread ? (
        <span
          className="absolute right-4 bottom-4 size-2 rounded-full bg-accent"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}

/**
 * Lytro's notice board (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-notices`; NTC-03, NTC-07, NTC-15): the unread count,
 * the lead, search, the category chips, pinned first then newest, kept 24 months. A read-only shop's owner still reads it
 * and presses "I understand"; a locked or archived shop's owner reaches it from Renew.
 */
export function NoticeBoardView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const { tenant } = useShell();
  const [category, setCategory] = useState<NoticeCategory | null>(null);
  const [query, setQuery] = useState('');
  const board = useNoticeBoard({ category, q: query });
  const items = board.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = board.data?.pages[0]?.unread ?? 0;
  const lapsed = tenant.state === TenantState.ReadOnly || tenant.state === TenantState.Locked;
  const nothingYet = board.isSuccess && items.length === 0 && !category && !query.trim();
  return (
    <ShellPage
      // Part 37's title with the unread count at its right, which stays when the desk header carries the title.
      actions={
        unread ? (
          <StatusTag tone="info">{t('p37NbUnread', { count: unread })}</StatusTag>
        ) : undefined
      }
    >
      {lapsed ? <Banner tone="neutral">{t('p37NbRo')}</Banner> : null}
      <p className="text-[14px] text-fg-muted">{t('p37NbLead')}</p>
      <div className="flex">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t('p37NbSearch')}
          label={t('p37NbSearch')}
        />
      </div>
      {nothingYet ? null : (
        <ChipRow>
          <Chip
            on={category === null}
            onClick={() => {
              setCategory(null);
            }}
          >
            {t('all')}
          </Chip>
          {CATEGORIES.map((each) => (
            <Chip
              key={each}
              on={category === each}
              onClick={() => {
                setCategory(each);
              }}
            >
              {shell(CATEGORY_WORD[each])}
            </Chip>
          ))}
        </ChipRow>
      )}
      {board.isLoading ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : nothingYet ? (
        <Card>
          <EmptyState icon="megaphone">{t('p37NbEmpty')}</EmptyState>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon="search">
            {query.trim() ? t('p37NbNone', { q: query.trim() }) : t('p37NbEmpty')}
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card flush>
            <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
              {items.map((notice) => (
                <NoticeRow key={notice.id} notice={notice} />
              ))}
            </div>
          </Card>
          {board.hasNextPage ? (
            <Button
              tone="outline"
              wide
              busy={board.isFetchingNextPage}
              onClick={() => {
                void board.fetchNextPage();
              }}
            >
              {shell('showEarlier')}
            </Button>
          ) : null}
        </>
      )}
    </ShellPage>
  );
}
