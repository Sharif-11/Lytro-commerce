import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useNotice, useNoticeAcknowledgments } from '@/api/notices';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { SearchBox } from '@/components/ui/search-box';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { formatSessionTime } from '@/lib/session-time';
import type { NoticeAcknowledgments, NoticeShop } from '@/types/notices';
import { titleIn } from './notice-text';

type Said = NoticeAcknowledgments['acknowledged'][number];

/** A shop by its name or its address, as the search reads them. */
function matches(shop: NoticeShop, words: string): boolean {
  const word = words.trim().toLowerCase();
  return !word || shop.shopName.toLowerCase().includes(word) || shop.slug.includes(word);
}

/**
 * NTC-05 (OPERATOR-CONSOLE-DESIGN §10c): the shops in a notice's audience now that said "I understand", and those still
 * to, over the lists the route answers whole.
 */
export function NoticeAcknowledgmentsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ from: '/_console/notices/$id/acknowledgments' });
  const notice = useNotice(id);
  const lists = useNoticeAcknowledgments(id);
  const [tab, setTab] = useState<'pending' | 'acked'>('pending');
  const [q, setQ] = useState('');
  const search = useCallback((words: string) => {
    setQ(words);
  }, []);
  const address = (shop: NoticeShop) => (
    <span className="text-fg-muted">{shop.slug}.lytro.app</span>
  );

  const pendingColumns: Column<NoticeShop>[] = [
    {
      key: 'shop',
      label: t('notices.cShop'),
      width: 'minmax(180px,1.4fr)',
      main: true,
      cell: (shop) => shop.shopName,
    },
    { key: 'address', label: t('notices.cAddress'), width: 'minmax(160px,1fr)', cell: address },
    {
      key: 'acts',
      label: '',
      width: '90px',
      actions: true,
      cell: (shop) => (
        <Button
          type="button"
          tone="outline"
          small
          fit
          className={SMALL_BUTTON}
          onClick={(event) => {
            event.stopPropagation();
            void navigate({ to: '/shops/$id', params: { id: shop.tenantId } });
          }}
        >
          {t('notices.openShop')}
        </Button>
      ),
    },
  ];
  const saidColumns: Column<Said>[] = [
    {
      key: 'shop',
      label: t('notices.cShop'),
      width: 'minmax(180px,1.4fr)',
      main: true,
      cell: (shop) => shop.shopName,
    },
    { key: 'address', label: t('notices.cAddress'), width: 'minmax(160px,1fr)', cell: address },
    {
      key: 'at',
      label: t('notices.cSaidAt'),
      width: '200px',
      cell: (shop) => (
        <span className="tabular-nums">
          {t('notices.ownerAt', { d: formatSessionTime(shop.acknowledgedAt) })}
        </span>
      ),
    },
  ];

  const title = notice.data ? titleIn(notice.data, i18n.language) : '';
  return (
    <ConsolePage>
      <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        <Link to="/notices" className="text-primary">
          {t('nav.notices')}
        </Link>
        <ConsoleIcon name="chev" />
        <Link to="/notices/$id" params={{ id }} className="min-w-0 truncate text-primary">
          {title}
        </Link>
      </div>
      <PageTitle title={t('notices.acknowledgments')} lead={t('notices.acknowledgmentsLead')} />
      {lists.isError ? (
        <LoadFailed
          onRetry={() => {
            void lists.refetch();
          }}
        />
      ) : (
        <>
          <Chips>
            <Chip
              on={tab === 'pending'}
              count={lists.data?.pendingCount ?? 0}
              onClick={() => {
                setTab('pending');
              }}
            >
              {t('notices.stillTo')}
            </Chip>
            <Chip
              on={tab === 'acked'}
              count={lists.data?.acknowledgedCount ?? 0}
              onClick={() => {
                setTab('acked');
              }}
            >
              {t('notices.saidIt')}
            </Chip>
          </Chips>
          <SearchBox label={t('notices.acknowledgmentsSearch')} value={q} onSearch={search} />
          {tab === 'pending' ? (
            <DataTable
              columns={pendingColumns}
              rows={(lists.data?.pending ?? []).filter((shop) => matches(shop, q))}
              rowKey={(shop) => shop.tenantId}
              loading={lists.isLoading}
              empty={
                <EmptyBox
                  icon="check"
                  title={t('notices.everyShopSaid')}
                  hint={t('notices.everyShopSaidHint')}
                />
              }
            />
          ) : (
            <DataTable
              columns={saidColumns}
              rows={(lists.data?.acknowledged ?? []).filter((shop) => matches(shop, q))}
              rowKey={(shop) => shop.tenantId}
              loading={lists.isLoading}
              empty={
                <EmptyBox
                  icon="bell"
                  title={t('notices.noShopSaid')}
                  hint={t('notices.noShopSaidHint')}
                />
              }
            />
          )}
        </>
      )}
    </ConsolePage>
  );
}
