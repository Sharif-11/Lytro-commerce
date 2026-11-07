import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, SelectField } from '@lytronix/ui';
import { CourierBlockReason, type CourierKey } from '@lytronix/validators';
import {
  useCourierBlocking,
  useRemoveCourier,
  useRetireCourier,
  useUndoRetire,
} from '@/api/couriers';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { Panel } from '@/components/ui/panel';
import { ReasonField } from '@/components/ui/reason-field';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import type { CourierBlockingOrder, OperatorCourier } from '@/types/couriers';

const BOLD = { b: <b className="font-semibold" /> };

/** CRR-23, CRR-25 (Slice 6.6 reads 1, 2, 5, 7 and 8): retire a courier, suggesting another active one. */
export function RetirePanel({
  courier,
  others,
  onClose,
}: {
  courier: OperatorCourier;
  /** The other active couriers, the ones it can suggest. */
  others: OperatorCourier[];
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const retire = useRetireCourier(courier.key);
  const [suggested, setSuggested] = useState<CourierKey | ''>(others[0]?.key ?? '');
  const [reason, setReason] = useState('');
  const suggestedName = others.find((each) => each.key === suggested)?.name ?? '';
  return (
    <ActionPanel
      title={t('couriers.retireTitle', { c: courier.name })}
      sub={t('couriers.connected', { count: courier.shops })}
      onClose={onClose}
      actionLabel={t('couriers.retireButton', { c: courier.name })}
      danger
      pending={retire.isPending}
      error={retire.isError ? errorMessage(retire.error, t) : null}
      canSubmit={suggested !== '' && reason.trim().length > 0}
      onSubmit={() => {
        if (suggested === '') return;
        retire.mutate(
          { suggestedKey: suggested, reason: reason.trim() },
          {
            onSuccess: (answer) => {
              toast(t('couriers.retired', { c: courier.name, count: answer.told }));
              onClose();
            },
          },
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <SelectField
          label={t('couriers.suggest')}
          name="suggestedKey"
          value={suggested}
          onChange={(event) => {
            const value = event.target.value;
            setSuggested(others.find((each) => each.key.valueOf() === value)?.key ?? suggested);
          }}
        >
          {others.map((each) => (
            <option key={each.key} value={each.key}>
              {each.name}
            </option>
          ))}
        </SelectField>
        <div className="text-[13px] text-fg-muted">{t('couriers.suggestHelp')}</div>
      </div>
      <Consequence>
        <Trans
          i18nKey="couriers.retireConsequence"
          values={{ count: courier.shops, c: courier.name, s: suggestedName }}
          components={BOLD}
        />
      </Consequence>
      {courier.defaultFor > 0 ? (
        <Consequence>
          <Trans
            i18nKey="couriers.retireDefaults"
            values={{ count: courier.defaultFor, s: suggestedName }}
            components={BOLD}
          />
        </Consequence>
      ) : null}
      <ReasonField value={reason} onChange={setReason} help={t('couriers.reasonHelp')} />
    </ActionPanel>
  );
}

/** Slice 6.6 read 6: it can be connected again, the shops told hear it's back, and defaults that moved stay. */
export function UndoRetirePanel({
  courier,
  onClose,
}: {
  courier: OperatorCourier;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const undo = useUndoRetire(courier.key);
  const [reason, setReason] = useState('');
  return (
    <ActionPanel
      title={t('couriers.undoTitle', { c: courier.name })}
      sub={t('couriers.connected', { count: courier.shops })}
      onClose={onClose}
      actionLabel={t('couriers.undoButton')}
      pending={undo.isPending}
      error={undo.isError ? errorMessage(undo.error, t) : null}
      canSubmit={reason.trim().length > 0}
      onSubmit={() => {
        undo.mutate(reason.trim(), {
          onSuccess: (answer) => {
            toast(t('couriers.undone', { c: courier.name, count: answer.told }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="ok">
        {t('couriers.undoConsequence', { c: courier.name, count: courier.shops })}
      </Consequence>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

/** Why one order still holds the courier back (Slice 6.6 read 3), in the colour of its reason. */
function WhyItWaits({ order }: { order: CourierBlockingOrder }): React.JSX.Element {
  const { t } = useTranslation();
  if (order.reason === CourierBlockReason.OnItsWay) {
    return (
      <span className="text-warning">
        {order.courierStatus
          ? t('couriers.onItsWayStatus', { s: order.courierStatus })
          : t('couriers.onItsWay')}
      </span>
    );
  }
  if (order.reason === CourierBlockReason.AwaitingPayout) {
    return (
      <>
        <span className="text-info">
          {order.finishedAt
            ? t('couriers.deliveredOn', { d: formatDay(order.finishedAt) })
            : t('couriers.awaitingPayout')}
        </span>
        {order.waitsUntil ? (
          <span className="text-fg-muted">
            {' · '}
            {t('couriers.stopsWaiting', { d: formatDay(order.waitsUntil) })}
          </span>
        ) : null}
      </>
    );
  }
  return <span className="text-fg-muted">{t('couriers.notSettled')}</span>;
}

/** What still waits on the courier: each order, its shop and why; only Close (read 3). */
function BlockedPanel({
  courier,
  orders,
  total,
  onClose,
}: {
  courier: OperatorCourier;
  orders: CourierBlockingOrder[];
  total: number;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const shops = new Set(orders.map((each) => each.tenantId)).size;
  return (
    <Panel
      open
      title={t('couriers.blockedTitle', { c: courier.name })}
      sub={t(shops === 1 ? 'couriers.blockedOneShop' : 'couriers.blocked', {
        count: total,
        s: shops,
      })}
      onClose={onClose}
      footer={
        <Button type="button" tone="outline" small fit onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Consequence>{t('couriers.blockedConsequence', { c: courier.name })}</Consequence>
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {orders.map((order) => (
            <li
              key={`${order.tenantId}-${order.orderId}`}
              className="flex flex-col gap-0.5 border-t border-line px-4 py-3 first:border-t-0"
            >
              <span className="text-[15px] font-medium tabular-nums">
                {order.orderNumber ? `#${order.orderNumber}` : '—'} · {order.shopName}
              </span>
              <span className="text-[13px]">
                <WhyItWaits order={order} />
              </span>
            </li>
          ))}
        </ul>
        {total > orders.length ? (
          <div className="text-[13px] text-fg-muted">
            {t('couriers.blockedMore', { n: orders.length })}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/** CRR-24 (read 4): removed for good, once nothing waits on it. Its keys and addresses go; past parcels keep its name. */
function RemoveForGoodPanel({
  courier,
  onClose,
  onBlocked,
}: {
  courier: OperatorCourier;
  onClose: () => void;
  /** The server found something waiting after all: read the list again. */
  onBlocked: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useRemoveCourier(courier.key);
  const [reason, setReason] = useState('');
  return (
    <ActionPanel
      title={t('couriers.removeTitle', { c: courier.name })}
      sub={t('couriers.connected', { count: courier.shops })}
      onClose={onClose}
      actionLabel={t('couriers.removeButton', { c: courier.name })}
      danger
      pending={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      canSubmit={reason.trim().length > 0}
      onSubmit={() => {
        remove.mutate(reason.trim(), {
          onSuccess: () => {
            toast(t('couriers.removedToast', { c: courier.name }));
            onClose();
          },
          onError: onBlocked,
        });
      }}
    >
      <Consequence tone="danger">
        <Trans
          i18nKey="couriers.removeConsequence"
          values={{ count: courier.shops, c: courier.name }}
          components={BOLD}
        />
      </Consequence>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

/** Remove reads what still waits on the courier first: while anything does, it says so and offers only Close. */
export function RemovePanel({
  courier,
  onClose,
}: {
  courier: OperatorCourier;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const blocking = useCourierBlocking(courier.key);
  if (blocking.isPending || blocking.isError) {
    return (
      <Panel open title={t('couriers.removeTitle', { c: courier.name })} onClose={onClose}>
        {blocking.isError ? (
          <div className="text-[14px] text-fg-muted">{errorMessage(blocking.error, t)}</div>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-3">
            {[80, 60].map((width) => (
              <span key={width} className="skel" style={{ width: `${String(width)}%` }} />
            ))}
          </div>
        )}
      </Panel>
    );
  }
  if (blocking.data.total > 0) {
    return (
      <BlockedPanel
        courier={courier}
        orders={blocking.data.orders}
        total={blocking.data.total}
        onClose={onClose}
      />
    );
  }
  return (
    <RemoveForGoodPanel
      courier={courier}
      onClose={onClose}
      onBlocked={() => {
        void blocking.refetch();
      }}
    />
  );
}
