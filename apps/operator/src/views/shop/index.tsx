import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { useShop } from '@/api/shops';
import { Banner } from '@/components/ui/banner';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle } from '@/components/ui/console-page';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyBox } from '@/components/ui/data-table';
import { LaterCard } from '@/components/ui/later-card';
import { LoadFailed } from '@/components/ui/load-failed';
import { StatusChip } from '@/components/ui/status-chip';
import { daysFromNow, formatDay } from '@/lib/format';
import { ShopStateChip } from '@/views/shops/shop-state-chip';
import { AddonsCards } from './addons-card';
import { OverridesCard } from './overrides-card';
import { PaymentsCard } from './payments-card';
import { PhonesCard } from './phones-card';
import { AdjustPanel, AssignPanel, RestorePanel, SuspendPanel } from './shop-panels';

type HeaderPanel = 'suspend' | 'restore' | 'adjust' | 'assign';

const ACTION = 'flex-[1_1_auto] sm:flex-none';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[12px] font-semibold tracking-[0.04em] text-fg-muted uppercase bn:text-[13px] bn:tracking-normal bn:normal-case">
        {label}
      </span>
      <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

/** One shop (OPERATOR-CONSOLE-DESIGN §5): its facts, its payments and phones, its limits, and each action in its panel. */
export function Shop(): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_console/shops/$id/' });
  const shop = useShop(id);
  const [panel, setPanel] = useState<HeaderPanel | null>(null);
  const [overridePanelOpen, setOverridePanelOpen] = useState(false);

  function close(): void {
    setPanel(null);
  }

  const crumbs = (
    <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
      <Link to="/shops" className="text-primary">
        {t('nav.shops')}
      </Link>
      <ConsoleIcon name="chev" />
      <span className="min-w-0 truncate">{shop.data?.shopName}</span>
    </div>
  );

  if (shop.isError) {
    const missing = shop.error instanceof ApiClientError && shop.error.status === 404;
    return (
      <ConsolePage>
        {crumbs}
        {missing ? (
          <ConsoleCard className="p-0!">
            <EmptyBox icon="store" title={t('shop.notFound')} hint={t('shops.emptyHint')} />
          </ConsoleCard>
        ) : (
          <LoadFailed
            onRetry={() => {
              void shop.refetch();
            }}
          />
        )}
      </ConsolePage>
    );
  }

  const data = shop.data;
  if (!data) {
    return (
      <ConsolePage>
        {crumbs}
        <span className="skel h-7! w-1/3" />
        <span className="skel w-2/3" />
      </ConsolePage>
    );
  }

  const days = data.periodEnd ? daysFromNow(data.periodEnd) : null;

  return (
    <ConsolePage>
      {crumbs}
      <PageTitle
        title={data.shopName}
        lead={
          <>
            <ShopStateChip state={data.state} />{' '}
            {data.suspension ? <StatusChip tone="bad">{t('shop.suspended')}</StatusChip> : null}{' '}
            <a
              href={`https://${data.slug}.lytro.app`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {data.slug}.lytro.app
            </a>{' '}
            · <span className="mono text-[13px]">{data.id}</span> <CopyButton text={data.id} />
          </>
        }
        actions={
          <>
            {data.suspension ? (
              <Button
                type="button"
                tone="outline"
                small
                fit
                className={ACTION}
                onClick={() => {
                  setPanel('restore');
                }}
              >
                <ConsoleIcon name="play" size={18} />
                {t('shop.restore')}
              </Button>
            ) : (
              <Button
                type="button"
                tone="outline"
                small
                fit
                className={ACTION}
                onClick={() => {
                  setPanel('suspend');
                }}
              >
                <ConsoleIcon name="pause" size={18} />
                {t('shop.suspend')}
              </Button>
            )}
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={ACTION}
              onClick={() => {
                setPanel('adjust');
              }}
            >
              {t('shop.adjust')}
            </Button>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={ACTION}
              onClick={() => {
                setPanel('assign');
              }}
            >
              {t('shop.assign')}
            </Button>
            <Button
              type="button"
              small
              fit
              className={ACTION}
              onClick={() => {
                setOverridePanelOpen(true);
              }}
            >
              <ConsoleIcon name="plus" size={18} />
              {t('shop.addOverride')}
            </Button>
          </>
        }
      />
      {data.suspension ? (
        <Banner tone="bad" icon="pause">
          {t('shop.suspendedNote', {
            d: formatDay(data.suspension.at),
            who: data.suspension.by ?? '—',
            r: data.suspension.reason ?? '—',
          })}
        </Banner>
      ) : null}
      <ConsoleCard>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label={t('shop.plan')}>
            {data.planName ?? '—'}{' '}
            {data.planVersion === null ? null : (
              <span className="font-medium text-fg-muted">v{data.planVersion}</span>
            )}
          </Fact>
          <Fact label={t('shop.period')}>
            {data.periodEnd && days !== null ? (
              <>
                {formatDay(data.periodEnd)}
                <span className="block text-[13px] font-medium text-fg-muted">
                  {days >= 0 ? t('shop.daysLeft', { n: days }) : t('shop.daysAgo', { n: -days })}
                </span>
              </>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label={t('shop.suspension')}>
            {data.suspension ? formatDay(data.suspension.at) : t('shop.notSuspended')}
          </Fact>
          <Fact label={t('shop.overrides')}>{data.overrideCount}</Fact>
        </div>
      </ConsoleCard>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PaymentsCard shop={data} />
        <PhonesCard shopId={data.id} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OverridesCard shop={data} adding={overridePanelOpen} onAdd={setOverridePanelOpen} />
        <div className="flex flex-col gap-3">
          <LaterCard title={t('shop.laterDetail')} hint={t('shop.laterDetailHint')} />
          <LaterCard title={t('shop.laterActions')} hint={t('shop.laterActionsHint')} />
        </div>
      </div>
      <AddonsCards shopId={data.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LaterCard title={t('shop.laterViewAs')} hint={t('shop.laterViewAsHint')} />
        <LaterCard title={t('shop.laterIdentity')} hint={t('shop.laterIdentityHint')} />
      </div>
      {panel === 'suspend' ? <SuspendPanel shop={data} onClose={close} /> : null}
      {panel === 'restore' ? <RestorePanel shop={data} onClose={close} /> : null}
      {panel === 'adjust' ? <AdjustPanel shop={data} onClose={close} /> : null}
      {panel === 'assign' ? <AssignPanel shop={data} onClose={close} /> : null}
    </ConsolePage>
  );
}
