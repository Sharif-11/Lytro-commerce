import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useCredentialUses, useShop } from '@/api/shops';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { Pager } from '@/components/ui/pager';
import { StatusChip } from '@/components/ui/status-chip';
import { formatSessionTime } from '@/lib/session-time';
import type { CredentialUse } from '@/types/operator';
import { CredentialUsesExport } from './credential-uses-export';

const PER_PAGE = 20;

/** SEC-11: every use of a shop's stored gateway keys, never the keys, for a dispute or something odd. */
export function ShopCredentials(): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_console/shops/$id/credentials' });
  const shop = useShop(id);
  const [page, setPage] = useState(1);
  const uses = useCredentialUses(id, page, PER_PAGE);
  const [exporting, setExporting] = useState(false);

  const columns: Column<CredentialUse>[] = [
    {
      key: 'when',
      label: t('shop.when'),
      width: '140px',
      main: true,
      cell: (use) => <span className="tabular-nums">{formatSessionTime(use.at)}</span>,
    },
    { key: 'wallet', label: t('shop.wallet'), width: '90px', cell: (use) => use.method },
    {
      key: 'action',
      label: t('shop.action'),
      width: 'minmax(170px,1.2fr)',
      cell: (use) => t(`credentialActions.${use.action}`),
    },
    {
      key: 'session',
      label: t('shop.session'),
      width: '110px',
      cell: (use) =>
        use.sessionId ? (
          <span className="mono block truncate text-[13px]">{use.sessionId}</span>
        ) : (
          <span className="text-fg-muted">{t('shop.none')}</span>
        ),
    },
    {
      key: 'result',
      label: t('shop.result'),
      width: '90px',
      cell: (use) =>
        use.succeeded ? (
          <StatusChip tone="ok">{t('shop.worked')}</StatusChip>
        ) : (
          <StatusChip tone="bad">{t('shop.failed')}</StatusChip>
        ),
    },
  ];

  return (
    <ConsolePage>
      <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        <Link to="/shops" className="text-primary">
          {t('nav.shops')}
        </Link>
        <ConsoleIcon name="chev" />
        <Link to="/shops/$id" params={{ id }} className="min-w-0 truncate text-primary">
          {shop.data?.shopName}
        </Link>
        <ConsoleIcon name="chev" />
        <span>{t('shop.credentials')}</span>
      </div>
      <PageTitle
        title={t('shop.credentials')}
        lead={t('shop.credentialsLead')}
        actions={
          // SEC-11 (Slice 9.9): the CSV covers every stored key, where this list shows the gateway's only.
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button
              type="button"
              tone="outline"
              small
              fit
              disabled={!shop.data}
              onClick={() => {
                setExporting(true);
              }}
            >
              <ConsoleIcon name="down" size={18} />
              {t('shop.cuButton')}
            </Button>
            <span className="max-w-[300px] text-[14px] text-neutral-700 sm:text-right">
              {t('shop.cuListNote')}
            </span>
          </div>
        }
      />
      {uses.isError ? (
        <LoadFailed
          onRetry={() => {
            void uses.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={uses.data?.uses ?? []}
          rowKey={(use) => `${use.at}-${use.action}-${use.sessionId ?? ''}`}
          loading={uses.isPending}
          empty={
            <EmptyBox
              icon="key"
              title={t('shop.credentialsEmpty')}
              hint={t('shop.credentialsEmptyHint')}
            />
          }
        />
      )}
      <Pager page={page} pages={uses.data?.pages ?? 1} onPage={setPage} />
      {exporting && shop.data ? (
        <CredentialUsesExport
          shopId={id}
          shopName={shop.data.shopName}
          shopSlug={shop.data.slug}
          onClose={() => {
            setExporting(false);
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
