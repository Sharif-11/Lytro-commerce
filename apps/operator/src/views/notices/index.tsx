import { useCallback, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { NoticeStatus, type NoticeCategory } from '@lytronix/validators';
import { useNotices } from '@/api/notices';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { SearchBox } from '@/components/ui/search-box';
import { CELL_NOTE, NOTE } from '@/components/ui/sizes';
import { formatDay } from '@/lib/format';
import type { OperatorNotice } from '@/types/notices';
import { CATEGORIES, onlyLanguage, titleIn, whenWords } from './notice-text';
import { AudienceWords, NoticeStatusChip, PinMark, SeverityChip } from './notice-words';
import { StartPanel } from './start-panel';

const LINE = 'text-[13px] font-normal whitespace-normal text-fg-muted';

/** OPERATOR-CONSOLE-DESIGN §10c: every notice, newest written first, by category or words (NTC-09). */
export function Notices(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [category, setCategory] = useState<NoticeCategory | null>(null);
  const [q, setQ] = useState('');
  const [starting, setStarting] = useState(false);
  const notices = useNotices({ category, q });
  const items = notices.data?.items ?? [];
  const search = useCallback((words: string) => {
    setQ(words);
  }, []);

  const open = (notice: OperatorNotice): void => {
    void navigate({ to: '/notices/$id', params: { id: notice.id } });
  };

  const columns: Column<OperatorNotice>[] = [
    {
      key: 'notice',
      label: t('notices.cNotice'),
      width: 'minmax(240px,2.2fr)',
      main: true,
      cell: (notice) => (
        <>
          <div className="whitespace-normal">
            <PinMark pinned={notice.pinned} />
            <Link to="/notices/$id" params={{ id: notice.id }} className="text-inherit">
              {titleIn(notice, i18n.language)}
            </Link>
          </div>
          <div className={CELL_NOTE}>
            {[
              t(`notices.categories.${notice.category}`),
              notice.editedAt ? t('notices.updated', { d: formatDay(notice.editedAt) }) : null,
              onlyLanguage(notice, t),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'severity',
      label: t('notices.cSeverity'),
      width: '130px',
      cell: (notice) => <SeverityChip severity={notice.severity} />,
    },
    {
      key: 'audience',
      label: t('notices.cAudience'),
      width: 'minmax(140px,1fr)',
      cell: (notice) => (
        <span className="whitespace-normal">
          <AudienceWords audience={notice.audience} />
        </span>
      ),
    },
    {
      key: 'state',
      label: t('notices.cState'),
      width: '160px',
      cell: (notice) => (
        <>
          <NoticeStatusChip status={notice.status} />
          <div className={LINE}>{whenWords(notice, t)}</div>
        </>
      ),
    },
    {
      key: 'reach',
      label: t('notices.cReach'),
      width: '170px',
      cell: (notice) =>
        notice.status === NoticeStatus.Draft || notice.status === NoticeStatus.Scheduled ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <>
            <span className="tabular-nums">
              {t('notices.reach', {
                count: notice.counts.shops,
                r: notice.counts.reads.toLocaleString('en-US'),
              })}
            </span>
            {notice.requiresAck ? (
              <div className={LINE}>
                {t('notices.acked', {
                  a: notice.counts.acknowledged.toLocaleString('en-US'),
                  s: notice.counts.shops.toLocaleString('en-US'),
                })}
              </div>
            ) : null}
          </>
        ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.notices')}
        lead={t('notices.lead')}
        actions={
          <Button
            type="button"
            small
            fit
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              setStarting(true);
            }}
          >
            <ConsoleIcon name="plus" size={18} />
            {t('notices.new')}
          </Button>
        }
      />
      {notices.isError ? (
        <LoadFailed
          onRetry={() => {
            void notices.refetch();
          }}
        />
      ) : (
        <>
          <SearchBox label={t('notices.search')} value={q} onSearch={search} />
          <Chips>
            <Chip
              on={category === null}
              onClick={() => {
                setCategory(null);
              }}
            >
              {t('notices.all')}
            </Chip>
            {CATEGORIES.map((each) => (
              <Chip
                key={each}
                on={category === each}
                onClick={() => {
                  setCategory(each);
                }}
              >
                {t(`notices.categories.${each}`)}
              </Chip>
            ))}
          </Chips>
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(notice) => notice.id}
            onOpen={open}
            faded={(notice) => notice.status === NoticeStatus.Withdrawn}
            loading={notices.isLoading}
            empty={
              <EmptyBox icon="bell" title={t('notices.empty')} hint={t('notices.emptyHint')} />
            }
          />
          {items.length > 0 ? (
            <div className={`${NOTE} text-center`}>{t('notices.listNote')}</div>
          ) : null}
        </>
      )}
      {starting ? (
        <StartPanel
          onClose={() => {
            setStarting(false);
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
