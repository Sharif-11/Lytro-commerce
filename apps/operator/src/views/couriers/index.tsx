import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { CourierAdapterState, type CourierKey } from '@lytronix/validators';
import { useOperatorCouriers } from '@/api/couriers';
import { Banner } from '@/components/ui/banner';
import { ConsolePage } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { formatDay } from '@/lib/format';
import type { OperatorCourier } from '@/types/couriers';
import { CouriersHead } from './couriers-head';
import { RemovePanel, RetirePanel, UndoRetirePanel } from './courier-panels';
import { suggestionsFor } from './places';

type Open = { step: 'retire' | 'undo' | 'remove'; courier: OperatorCourier } | null;

const STATE_TONES: Record<CourierAdapterState, ChipTone> = {
  [CourierAdapterState.Active]: 'ok',
  [CourierAdapterState.Retiring]: 'warn',
  [CourierAdapterState.Removed]: 'mute',
};

const BOLD = { b: <b className="font-semibold" /> };

/** A count as the sketch writes it: 1,342. */
function count(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * OPERATOR-CONSOLE-DESIGN §10b, CRR-23 to CRR-25 (Slice 6.6's read): the couriers shops can connect. Retiring stops new
 * connections while shops already connected carry on; removing it comes once nothing waits on it; a removed one stays,
 * faded, for its name on past parcels.
 */
export function Couriers(): React.JSX.Element {
  const { t } = useTranslation();
  const couriers = useOperatorCouriers();
  const [open, setOpen] = useState<Open>(null);
  const all = couriers.data ?? [];
  const nameOf = (key: CourierKey | null): string =>
    all.find((each) => each.key === key)?.name ?? key ?? '';
  const close = (): void => {
    setOpen(null);
  };

  const columns: Column<OperatorCourier>[] = [
    {
      key: 'courier',
      label: t('couriers.cCourier'),
      width: 'minmax(200px,1.6fr)',
      main: true,
      cell: (courier) => (
        <>
          <div>
            {courier.name} <span className={`mono ${CELL_NOTE}`}>{courier.key}</span>
          </div>
          {courier.state === CourierAdapterState.Retiring && courier.retiringSince ? (
            <div className="text-[13px] font-normal whitespace-normal text-fg-muted">
              {t('couriers.retiringLine', {
                d: formatDay(courier.retiringSince),
                s: nameOf(courier.suggestedKey),
              })}
            </div>
          ) : null}
          {courier.state === CourierAdapterState.Removed && courier.removedAt ? (
            <div className="text-[13px] font-normal whitespace-normal text-fg-muted">
              {t('couriers.removedLine', { d: formatDay(courier.removedAt) })}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'state',
      label: t('couriers.cStatus'),
      width: '110px',
      cell: (courier) => (
        <StatusChip tone={STATE_TONES[courier.state]}>{t(`couriers.${courier.state}`)}</StatusChip>
      ),
    },
    {
      key: 'shops',
      label: t('couriers.cShops'),
      width: '120px',
      cell: (courier) => <span className="tabular-nums">{count(courier.shops)}</span>,
    },
    {
      key: 'default',
      label: t('couriers.cDefault'),
      width: '110px',
      cell: (courier) => <span className="tabular-nums">{count(courier.defaultFor)}</span>,
    },
    {
      key: 'onway',
      label: t('couriers.cOnWay'),
      width: '130px',
      cell: (courier) => <span className="tabular-nums">{count(courier.onTheirWay)}</span>,
    },
    {
      key: 'acts',
      label: '',
      width: '220px',
      actions: true,
      cell: (courier) => {
        if (courier.state === CourierAdapterState.Removed) return null;
        if (courier.state === CourierAdapterState.Active) {
          return (
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={() => {
                setOpen({ step: 'retire', courier });
              }}
            >
              {t('couriers.retire')}
            </Button>
          );
        }
        return (
          <>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={() => {
                setOpen({ step: 'undo', courier });
              }}
            >
              {t('couriers.undo')}
            </Button>
            <Button
              type="button"
              tone="ghost"
              small
              fit
              className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
              onClick={() => {
                setOpen({ step: 'remove', courier });
              }}
            >
              {t('couriers.remove')}
            </Button>
          </>
        );
      },
    },
  ];

  const retiring = all.filter((each) => each.state === CourierAdapterState.Retiring);

  return (
    <ConsolePage>
      <CouriersHead active="couriers" />
      {couriers.isError ? (
        <LoadFailed
          onRetry={() => {
            void couriers.refetch();
          }}
        />
      ) : (
        <>
          {retiring.map((courier) => (
            <Banner key={courier.key} tone="warn" icon="warn">
              <Trans
                i18nKey="couriers.retiringBanner"
                values={{ c: courier.name }}
                components={BOLD}
              />
            </Banner>
          ))}
          <DataTable
            columns={columns}
            rows={all}
            rowKey={(courier) => courier.key}
            loading={couriers.isPending}
            faded={(courier) => courier.state === CourierAdapterState.Removed}
            empty={<EmptyBox icon="truck" title={t('nav.couriers')} hint={t('couriers.lead')} />}
          />
        </>
      )}
      {open?.step === 'retire' ? (
        <RetirePanel
          courier={open.courier}
          others={suggestionsFor(open.courier, all)}
          onClose={close}
        />
      ) : null}
      {open?.step === 'undo' ? <UndoRetirePanel courier={open.courier} onClose={close} /> : null}
      {open?.step === 'remove' ? <RemovePanel courier={open.courier} onClose={close} /> : null}
    </ConsolePage>
  );
}
