import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { OrderAccess } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { useShell } from '@/shell/shell-context';
import type { MeFairUse } from '@/types/me';
import type { Order } from '@/types/orders';

/** PAYG-FAIR-USE-PLAN: the three prices an order from Lytro names, as the shop's /me says them. */
export function useUnlockPrices(): { phone: string; confirm: string; total: string } {
  const { tenant } = useShell();
  const fair: MeFairUse | undefined = tenant.fairUse;
  const phone = Number(fair?.unlockPhone ?? '7');
  const confirm = Number(fair?.unlockConfirm ?? '3');
  return {
    phone: formatTaka(phone),
    confirm: formatTaka(confirm),
    total: formatTaka(phone + confirm),
  };
}

/** Whether the order is still being opened: locked (step 0) or with only its phone shown (step 1). */
export const opening = (order: Pick<Order, 'access'>): boolean =>
  order.access === OrderAccess.Locked || order.access === OrderAccess.Phone;

/** The sketch's step tiles: the phone, the confirm, then the courier at no further fee. */
function Steps({ order }: { order: Order }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const prices = useUnlockPrices();
  const state =
    order.access === OrderAccess.Locked ? 0 : order.access === OrderAccess.Phone ? 1 : 2;
  const tile = (now: boolean, done: boolean): string =>
    `flex min-w-0 flex-1 flex-col gap-0.5 rounded-[10px] border px-2.5 py-2 text-[13px] leading-[1.35] ${
      now
        ? 'border-primary bg-surface text-fg shadow-[inset_0_0_0_1px_var(--color-primary)]'
        : done
          ? 'border-brand-200 bg-brand-50 text-fg-muted'
          : 'border-brand-200 bg-surface text-fg-muted'
    }`;
  return (
    <div className="mt-3 flex gap-2">
      <div className={tile(state === 0, state > 0)}>
        <span className="text-[12px]">
          {t('fair.step1')}
          {state > 0 ? ` · ${t('fair.stepDone')}` : ''}
        </span>
        <b className="text-[14px] text-fg">{t('fair.stepPhone')}</b>
        <span className="num">{prices.phone}</span>
      </div>
      <div className={tile(state === 1, state > 1)}>
        <span className="text-[12px]">
          {t('fair.step2')}
          {state > 1 ? ` · ${t('fair.stepDone')}` : ''}
        </span>
        <b className="text-[14px] text-fg">{t('fair.stepConfirm')}</b>
        <span>{t('fair.stepConfirmFee', { fee: prices.confirm })}</span>
      </div>
      <div className={tile(state === 2, false)}>
        <span className="text-[12px]">{t('fair.stepThen')}</span>
        <b className="text-[14px] text-fg">{t('fair.stepCourier')}</b>
        <span>{t('fair.stepCourierFee')}</span>
      </div>
    </div>
  );
}

/**
 * PYG-22 (PF-1 to PF-3, the sketch's `pf-step0` and `pf-step1`): what opening the order costs, and where it stands. A
 * locked order with a balance short of the phone says so instead, with the top-up (`pf-empty`).
 */
export function AccessCard({
  order,
  short,
}: {
  order: Order;
  /** The balance short of showing the phone, as the balance gate says it; null when it covers it. */
  short: { balance: string } | null;
}): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { slug } = useShell();
  const prices = useUnlockPrices();
  if (order.access === OrderAccess.Locked && short !== null) {
    return (
      <Banner
        tone="bad"
        action={
          <Link to="/$shop/balance" params={{ shop: slug }} search={{ topup: 1 }}>
            {t('fair.topUp')}
          </Link>
        }
      >
        <b>{t('fair.emptyT', { balance: short.balance })}</b> {t('fair.emptyB')}
      </Banner>
    );
  }
  if (order.access === OrderAccess.Confirmed) {
    return (
      <Banner tone="info" icon="check">
        <b>{t('fair.confirmedT')}</b> {t('fair.confirmedB', prices)}
      </Banner>
    );
  }
  if (!opening(order)) return null;
  const locked = order.access === OrderAccess.Locked;
  return (
    <div className="rounded-card border border-brand-200 bg-primary-soft px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 flex-none items-center justify-center rounded-[10px] border border-brand-200 bg-surface text-primary-text">
          <Icon name={locked ? 'lock' : 'phone'} />
        </span>
        <div className="min-w-0 text-[14px] leading-[1.5]">
          <b className="block text-[15px] text-fg">
            {locked ? t('fair.lockedTitle') : t('fair.phoneTitle', prices)}
          </b>
          <span className="text-fg-muted">
            {locked ? t('fair.lockedBody', prices) : t('fair.phoneBody', prices)}
          </span>
        </div>
      </div>
      <Steps order={order} />
      {locked ? (
        <p className="mt-2.5 flex items-start gap-2 text-[13px] text-fg-muted">
          <Icon name="info" size={16} />
          <span>{t('fair.lockedNote')}</span>
        </p>
      ) : null}
    </div>
  );
}

/** The customer card's line while the address is held back (PF-21, PF-22). */
export function HiddenAddress({ order }: { order: Order }): React.JSX.Element {
  const { t } = useTranslation('orders');
  return (
    <div className="mt-2.5 flex items-start gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-[14px] text-fg-muted">
      <Icon name="lock" size={16} />
      <span>
        {order.access === OrderAccess.Locked ? t('fair.hiddenLocked') : t('fair.hiddenPhone')}
      </span>
    </div>
  );
}
