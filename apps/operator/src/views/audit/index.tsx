import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { PlatformAuditAction } from '@lytronix/validators';
import { useAuditLog, type AuditFilters } from '@/api/audit';
import { useOperatorMe } from '@/api/operator-auth';
import { useSearchShops, useShop } from '@/api/shops';
import { chipClass } from '@/components/ui/chip-class';
import { Chips } from '@/components/ui/chips';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { formatSessionTime } from '@/lib/session-time';
import type { AuditEntry } from '@/types/records';
import { FilterChip, Filters, Pick, PickInput, PickSelect } from '@/views/records/parts';
import { AuditEntryPanel } from './entry-panel';
import { actionWords, lineOf, whoWords } from './summary';

const ACTIONS: readonly string[] = Object.values(PlatformAuditAction);
const MINE = 'mine';

/**
 * OPERATOR-CONSOLE-DESIGN §10f, ADM-08, D8-11 (Slice 8.4's route): every action on the platform, newest first: who, what,
 * which shop and why, filtered by shop, person, action and day. Nothing here can be changed. An entry opens in a panel
 * that filters to its person or its shop.
 */
export function AuditLog(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: '/audit' });
  const filters = useSearch({ from: '/_console/audit' });
  const me = useOperatorMe();
  const log = useAuditLog(filters);
  const shops = useSearchShops('');
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const entries = log.data?.pages.flatMap((page) => page.items) ?? [];
  const myId = me.data?.id;
  const someoneElse = filters.actorId !== undefined && filters.actorId !== myId;

  // The chosen shop's name: from the list of shops, an entry of its own, or its page.
  const listed = shops.data?.pages.flatMap((page) => page.entries) ?? [];
  const chosen = useShop(
    filters.tenantId ?? '',
    filters.tenantId !== undefined && !listed.some((shop) => shop.id === filters.tenantId),
  );
  const chosenName =
    listed.find((shop) => shop.id === filters.tenantId)?.shopName ??
    entries.find((entry) => entry.shop?.id === filters.tenantId)?.shop?.name ??
    chosen.data?.shopName ??
    filters.tenantId;
  const otherEmail = entries.find((entry) => entry.actorId === filters.actorId)?.actorEmail;

  function narrow(next: Partial<AuditFilters>): void {
    setOpen(null);
    void navigate({
      search: (previous) => {
        const merged: Record<string, string | undefined> = { ...previous, ...next };
        return Object.fromEntries(
          Object.entries(merged).filter(([, value]) => value !== undefined && value !== ''),
        );
      },
    });
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: 'when',
      label: t('audit.when'),
      width: '120px',
      cell: (entry) => <span className="tabular-nums">{formatSessionTime(entry.createdAt)}</span>,
    },
    {
      key: 'what',
      label: t('audit.action'),
      width: 'minmax(180px,1.6fr)',
      main: true,
      cell: (entry) => {
        const line = lineOf(entry, t);
        return (
          <>
            <button
              type="button"
              className="text-left"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(entry);
              }}
            >
              {actionWords(entry.action, t)}
            </button>
            {line ? (
              <div className="text-[13px] font-normal whitespace-normal text-fg-muted">{line}</div>
            ) : null}
          </>
        );
      },
    },
    {
      key: 'shop',
      label: t('audit.shop'),
      width: 'minmax(110px,.8fr)',
      cell: (entry) => entry.shop?.name ?? <span className="text-fg-muted">—</span>,
    },
    {
      key: 'who',
      label: t('audit.who.label'),
      width: '128px',
      cell: (entry) => <span className="[overflow-wrap:anywhere]">{whoWords(entry, t)}</span>,
    },
  ];

  return (
    <ConsolePage>
      <PageTitle title={t('nav.audit')} lead={t('audit.lead')} />
      <Filters>
        <Pick label={t('audit.shop')}>
          <PickSelect
            value={filters.tenantId ?? ''}
            onChange={(event) => {
              narrow({ tenantId: event.target.value || undefined });
            }}
          >
            <option value="">{t('audit.anyShop')}</option>
            {filters.tenantId && !listed.some((shop) => shop.id === filters.tenantId) ? (
              <option value={filters.tenantId}>{chosenName}</option>
            ) : null}
            {listed.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.shopName}
              </option>
            ))}
          </PickSelect>
        </Pick>
        <Pick label={t('audit.who.label')}>
          <PickSelect
            value={myId !== undefined && filters.actorId === myId ? MINE : ''}
            onChange={(event) => {
              narrow({ actorId: event.target.value === MINE ? myId : undefined });
            }}
          >
            <option value="">{t('audit.anyone')}</option>
            <option value={MINE} disabled={myId === undefined}>
              {t('audit.onlyMine')}
            </option>
          </PickSelect>
        </Pick>
        <Pick label={t('audit.action')} wide>
          <PickSelect
            value={filters.action ?? ''}
            onChange={(event) => {
              narrow({ action: event.target.value || undefined });
            }}
          >
            <option value="">{t('audit.anyAction')}</option>
            {ACTIONS.map((action) => (
              <option key={action} value={action}>
                {actionWords(action, t)}
              </option>
            ))}
          </PickSelect>
        </Pick>
        <Pick label={t('audit.from')}>
          <PickInput
            type="date"
            value={filters.dateFrom ?? ''}
            max={filters.dateTo}
            onChange={(event) => {
              narrow({ dateFrom: event.target.value || undefined });
            }}
          />
        </Pick>
        <Pick label={t('audit.to')}>
          <PickInput
            type="date"
            value={filters.dateTo ?? ''}
            min={filters.dateFrom}
            onChange={(event) => {
              narrow({ dateTo: event.target.value || undefined });
            }}
          />
        </Pick>
      </Filters>
      {filters.tenantId || someoneElse ? (
        <Chips>
          {filters.tenantId ? (
            <FilterChip
              label={t('audit.removeFilter', { what: chosenName })}
              onRemove={() => {
                narrow({ tenantId: undefined });
              }}
            >
              {chosenName}
            </FilterChip>
          ) : null}
          {someoneElse ? (
            <FilterChip
              label={t('audit.removeFilter', { what: otherEmail ?? filters.actorId })}
              onRemove={() => {
                narrow({ actorId: undefined });
              }}
            >
              {otherEmail ?? filters.actorId}
            </FilterChip>
          ) : null}
          <button
            type="button"
            className={chipClass(false)}
            onClick={() => {
              void navigate({ search: {} });
            }}
          >
            {t('audit.clear')}
          </button>
        </Chips>
      ) : null}
      {log.isError ? (
        <LoadFailed
          onRetry={() => {
            void log.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(entry) => String(entry.id)}
          onOpen={setOpen}
          loading={log.isPending}
          empty={<EmptyBox icon="history" title={t('audit.empty')} hint={t('audit.emptyHint')} />}
        />
      )}
      {log.hasNextPage ? (
        <div className="text-center">
          <Button
            type="button"
            tone="outline"
            small
            fit
            loading={log.isFetchingNextPage}
            onClick={() => {
              void log.fetchNextPage();
            }}
          >
            {t('audit.loadMore')}
          </Button>
        </div>
      ) : null}
      <AuditEntryPanel
        entry={open}
        onClose={() => {
          setOpen(null);
        }}
        onOnlyPerson={(actorId) => {
          narrow({ actorId });
        }}
        onOnlyShop={(tenantId) => {
          narrow({ tenantId });
        }}
      />
    </ConsolePage>
  );
}
