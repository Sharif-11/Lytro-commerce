import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CourierConnectionState, Permission } from '@lytronix/validators';
import { useCourierAdapters, useCourierConnections } from '@/api/couriers';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { rowClass, RowChevron, RowLead, RowList } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { courierName } from '@/lib/couriers';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { CourierAdapter, CourierConnected, CourierConnection } from '@/types/couriers';
import { ConnectSheet, PasteSheet } from './sheets';
import { ASKS_WORD, messageLine } from './words';

/** A group's heading inside its card (the prototype's `.daylbl`). */
export function GroupLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
      {children}
    </div>
  );
}

/** A courier's square at the start of its row: the truck, never its logo. */
export function CourierLead(): React.JSX.Element {
  return (
    <RowLead className="text-neutral-700">
      <Icon name="truck" />
    </RowLead>
  );
}

/** A connection's name with its Default and Retiring tags (Part 36's `c36ConnRow`). */
export function ConnectionName({
  connection,
}: {
  connection: CourierConnection;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <span className="text-[16px] font-medium">
      {connection.name}
      {connection.isDefault ? (
        <>
          {' '}
          <StatusTag tone="ok">{t('crDefault')}</StatusTag>
        </>
      ) : null}
      {connection.retiring ? (
        <>
          {' '}
          <StatusTag tone="warn">{t('crRetiring')}</StatusTag>
        </>
      ) : null}
    </span>
  );
}

/** Whether its messages arrive, or that Pathao refused its login (Part 36's `c36Msg`). */
export function ConnectionState({
  connection,
}: {
  connection: CourierConnection;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  if (connection.state === CourierConnectionState.LoginRefused) {
    return <span className="text-[14px] text-danger-text">{t('crLoginEnded')}</span>;
  }
  const line = messageLine(connection, t);
  return (
    <span
      className={`num text-[14px] ${line.tone === 'ok' ? 'text-success' : line.tone === 'warn' ? 'text-warning' : 'text-fg-muted'}`}
    >
      {line.text}
    </span>
  );
}

/**
 * A courier being retired, as the shop is told (Slice 6.6's read): bookings and news with it still work; the shop's default is now
 * the courier the operator suggested where it moved there, else connect that one.
 */
export function RetiringBanner({
  retiring,
  connections,
  standalone = false,
}: {
  retiring: CourierConnection;
  connections: CourierConnection[];
  /** On the courier's own page, which says only what to connect. */
  standalone?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const suggested = retiring.suggestedKey ? courierName(retiring.suggestedKey) : '';
  const moved =
    !standalone &&
    connections.some((each) => each.courierKey === retiring.suggestedKey && each.isDefault);
  return (
    <Banner tone="warn">
      {moved
        ? t('crRetiringMoved', { c: retiring.name, s: suggested })
        : t('crRetiringB', { c: retiring.name, s: suggested })}
    </Banner>
  );
}

type Open =
  { kind: 'connect'; adapter: CourierAdapter } | { kind: 'paste'; connected: CourierConnected };

/**
 * Settings › Couriers (TENANT-DASHBOARD-DESIGN §7.39, Part 36's `c36`; CRR-01 to CRR-05, CRR-20, CRR-23): the shop's own courier
 * accounts. Connected couriers first, the default marked, a retiring one marked, the pickup store where its courier has stores,
 * and whether its messages arrive; then the couriers still to connect, each with what it asks for. Staff who may book but not
 * manage see the list with no actions.
 */
export function CouriersView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { slug, viewer } = useShell();
  const manage = allows(viewer, [Permission.CouriersManage]);
  const connections = useCourierConnections();
  const adapters = useCourierAdapters();
  const [open, setOpen] = useState<Open | null>(null);
  const connected = connections.data ?? [];
  const offered = (adapters.data ?? []).filter(
    (adapter) => !connected.some((each) => each.courierKey === adapter.key),
  );
  const retiring = connected.filter((each) => each.retiring);
  const failure = connections.error ?? adapters.error;
  const close = (): void => {
    setOpen(null);
  };

  return (
    <ShellPage>
      <div className="flex max-w-[640px] flex-col gap-3.5" tabIndex={manage ? undefined : 0}>
        <p className="text-[14px] text-fg-muted">{t('crLead')}</p>
        {failure ? <Banner tone="bad">{errorText(failure)}</Banner> : null}
        {manage ? null : <Banner tone="neutral">{t('crStaffNote')}</Banner>}
        {retiring.map((each) => (
          <RetiringBanner key={each.courierKey} retiring={each} connections={connected} />
        ))}
        {/* Slice 6.6 (Part 36's `c36-back`): its retiring undone, said for 7 days; a default moved meanwhile stays moved. */}
        {connected
          .filter((each) => each.backSince !== null)
          .map((each) => (
            <Banner key={`back-${each.courierKey}`} tone="info">
              {t('crBack', { c: each.name })}
            </Banner>
          ))}
        {connections.isPending ? (
          <Card flush>
            <SkeletonRows count={2} />
          </Card>
        ) : connected.length > 0 ? (
          <Card flush>
            <GroupLabel>{t('crConnected')}</GroupLabel>
            <RowList>
              {connected.map((connection) => {
                const body = (
                  <>
                    <CourierLead />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <ConnectionName connection={connection} />
                      {connection.pickupStore ? (
                        <span className="text-[14px] text-fg-muted">
                          {t('crStore')}: {connection.pickupStore.name}
                        </span>
                      ) : null}
                      <ConnectionState connection={connection} />
                    </span>
                  </>
                );
                return manage ? (
                  <Link
                    key={connection.courierKey}
                    to="/$shop/settings/couriers/$courierKey"
                    params={{ shop: slug, courierKey: connection.courierKey }}
                    className={`${rowClass} min-h-[72px] items-start`}
                  >
                    {body}
                    <RowChevron />
                  </Link>
                ) : (
                  <div
                    key={connection.courierKey}
                    className={`${rowClass} min-h-[72px] items-start`}
                  >
                    {body}
                  </div>
                );
              })}
            </RowList>
          </Card>
        ) : null}
        {manage && adapters.isSuccess && offered.length > 0 ? (
          <Card flush>
            <GroupLabel>
              {connected.length > 0 ? t('crConnectMore') : t('crConnectFirst')}
            </GroupLabel>
            <RowList>
              {offered.map((adapter) => (
                <button
                  key={adapter.key}
                  type="button"
                  onClick={() => {
                    setOpen({ kind: 'connect', adapter });
                  }}
                  className={`${rowClass} min-h-[60px]`}
                >
                  <CourierLead />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[16px] font-medium">{adapter.name}</span>
                    <span className="text-[14px] text-fg-muted">{t(ASKS_WORD[adapter.key])}</span>
                  </span>
                  <span className={buttonClass('outline', 'xs')}>{t('crConnectBtn')}</span>
                </button>
              ))}
            </RowList>
          </Card>
        ) : null}
      </div>
      {open?.kind === 'connect' ? (
        <ConnectSheet
          adapter={open.adapter}
          mode="connect"
          onClose={close}
          onConnected={(connected) => {
            setOpen({ kind: 'paste', connected });
          }}
        />
      ) : null}
      {open?.kind === 'paste' ? (
        <PasteSheet
          courier={open.connected.courierKey}
          name={open.connected.name}
          address={open.connected.message}
          again={false}
          onClose={close}
        />
      ) : null}
    </ShellPage>
  );
}
