import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ListenerDeviceStatus, ListenerRevokeReason, Permission } from '@lytronix/validators';
import { useListenerPhones } from '@/api/listener';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { rowClass, RowChevron, RowLead, RowList } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { appConfig } from '@/lib/app-config';
import { formatDayMonth } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ListenerPhone } from '@/types/payments';
import { PairSheet } from './pair-sheet';
import { spanWords } from './phone-health';
import { PhoneSheet } from './phone-sheet';

const GONE_WORD: Record<ListenerRevokeReason, string> = {
  [ListenerRevokeReason.Owner]: 'lpGoneOwner',
  [ListenerRevokeReason.Device]: 'lpGoneDevice',
  [ListenerRevokeReason.Operator]: 'lpGoneOperator',
  [ListenerRevokeReason.Flags]: 'lpGoneFlags',
  [ListenerRevokeReason.InstallationBlocked]: 'lpGoneBlocked',
};

const appLinkClass = 'inline-flex items-center gap-1 font-semibold text-primary underline';

function AppLink({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <a href={appConfig.listenerAppUrl()} target="_blank" rel="noreferrer" className={appLinkClass}>
      {children} <Icon name="external" />
    </a>
  );
}

function PhoneRow({
  phone,
  onOpen,
}: {
  phone: ListenerPhone;
  onOpen: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <button type="button" className={`${rowClass} hover:bg-neutral-50`} onClick={onOpen}>
      <RowLead>
        <Icon name="smartphone" />
      </RowLead>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">{phone.name}</span>
        {phone.model ? <span className="num text-[14px] text-fg-muted">{phone.model}</span> : null}
        <span className="num text-[14px] text-fg-muted">
          {phone.lastSeenAt
            ? t('lpSeen', { span: spanWords(phone.lastSeenAt, t) })
            : t('lpNotSeen')}{' '}
          · {t('lpToday', { count: phone.uploadsToday })}
        </span>
      </span>
      <StatusTag tone={phone.online ? 'ok' : 'warn'}>
        {t(phone.online ? 'lpOnline' : 'lpOffline')}
      </StatusTag>
      <RowChevron />
    </button>
  );
}

/**
 * Listener phones (TENANT-DASHBOARD-DESIGN §7.37, the prototype's `lp35`, LSN-02, LSN-20, Slice 5.8's part 4): the phones reading
 * this shop's payment SMS. Pairing stops at the plan's limit (LSN-08), and a phone cancelled stays listed with why.
 */
export function ListenerPhonesView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, viewer, showToast } = useShell();
  const canManage = allows(viewer, [Permission.ListenerManage]);
  const phones = useListenerPhones();
  const [pairing, setPairing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const data = phones.data;
  const active = data?.devices.filter((each) => each.status === ListenerDeviceStatus.Active) ?? [];
  const gone = data?.devices.filter((each) => each.status === ListenerDeviceStatus.Revoked) ?? [];
  const full = data !== undefined && data.limit !== null && data.active >= data.limit;
  const open = active.find((each) => each.id === openId) ?? null;
  const flagged = active.some((each) => each.flags > 0);

  return (
    <ShellPage
      actions={
        canManage && !full && data ? (
          <Button
            size="sm"
            onClick={() => {
              setPairing(true);
            }}
          >
            <Icon name="plus" />
            {t('lpPair')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex max-w-[640px] flex-col gap-3.5">
        <p className="m-0 text-[14px] text-fg-muted">{t('lpLead')}</p>
        {phones.isError ? <ErrorBanner error={phones.error} /> : null}
        {data && !canManage ? <Banner tone="neutral">{t('lpRo')}</Banner> : null}
        {canManage && full ? (
          <Banner
            tone="warn"
            action={
              <Link
                to="/$shop/plan"
                params={{ shop: slug }}
                className="font-semibold whitespace-nowrap text-primary underline"
              >
                {t('lpSeePlan')}
              </Link>
            }
          >
            {t('lpFull')}
          </Banner>
        ) : null}
        {flagged ? <Banner tone="warn">{t('lpFlags')}</Banner> : null}
        {data && active.length === 0 ? (
          <Card>
            <h2 className="mt-0 mb-2 text-[16px] font-semibold">{t('lpStepsTitle')}</h2>
            <ol className="m-0 flex list-decimal flex-col gap-1.5 ps-5 text-[15px]">
              <li>{t('lpStep1')}</li>
              <li>{t('lpStep2')}</li>
              <li>{t('lpStep3')}</li>
            </ol>
            <div className="mt-3">
              <AppLink>{t('lpGetApp')}</AppLink>
            </div>
          </Card>
        ) : null}
        {active.length > 0 && data ? (
          <Card flush>
            <div className="num bg-neutral-50 px-4 py-2 text-[13px] font-semibold text-fg-muted">
              {data.limit === null
                ? t('pmPaired', { count: data.active })
                : t('lpCount', { paired: data.active, limit: data.limit })}
            </div>
            <RowList>
              {active.map((phone) => (
                <PhoneRow
                  key={phone.id}
                  phone={phone}
                  onOpen={() => {
                    setOpenId(phone.id);
                  }}
                />
              ))}
            </RowList>
          </Card>
        ) : null}
        {gone.length > 0 ? (
          <Card flush>
            <div className="bg-neutral-50 px-4 py-2 text-[13px] font-semibold text-fg-muted">
              {t('lpGone')}
            </div>
            <RowList>
              {gone.map((phone) => (
                <div key={phone.id} className={rowClass}>
                  <RowLead>
                    <Icon name="smartphone" />
                  </RowLead>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[16px] font-medium text-fg-muted">{phone.name}</span>
                    <span className="num text-[14px] text-fg-muted">
                      {[
                        phone.revokeReason ? t(GONE_WORD[phone.revokeReason]) : null,
                        phone.revokedAt ? formatDayMonth(phone.revokedAt) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </div>
              ))}
            </RowList>
          </Card>
        ) : null}
        {active.length > 0 ? (
          <div>
            <AppLink>{t('lpGetApp')}</AppLink>
          </div>
        ) : null}
      </div>
      {pairing ? (
        <PairSheet
          known={data?.devices.map((each) => each.id) ?? []}
          onClose={() => {
            setPairing(false);
          }}
        />
      ) : null}
      {open ? (
        <PhoneSheet
          phone={open}
          canManage={canManage}
          onClose={() => {
            setOpenId(null);
          }}
          onCancelled={(name) => {
            setOpenId(null);
            showToast(t('lpCancelled', { name }));
          }}
        />
      ) : null}
    </ShellPage>
  );
}
