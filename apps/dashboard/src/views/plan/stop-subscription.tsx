import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { useCancelSubscription, useCloseShop } from '@/api/billing';
import { errorMessage } from '@lytronix/api-client';
import { Button, ConfirmDialog, formatDate, Icon } from '@lytronix/ui';
import type { MeTenant } from '@/types/me';

interface StopSubscriptionProps {
  tenant: MeTenant;
  isOwner: boolean;
  cancelled: boolean;
  onCancelled: () => void;
  onClosed: () => void;
}

/** Stopping is a disclosure at the foot, never a card: one paragraph on what follows and a red button that
    names the shop in its confirmation. A pay-as-you-go owner closes the shop instead (PYG-09). */
export function StopSubscription({
  tenant,
  isOwner,
  cancelled,
  onCancelled,
  onClosed,
}: StopSubscriptionProps): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const cancel = useCancelSubscription();
  const closeShop = useCloseShop();
  const [confirming, setConfirming] = useState<'cancel' | 'close' | null>(null);
  const subscribed = tenant.state === TenantState.Active || tenant.state === TenantState.Grace;
  const payg = tenant.state === TenantState.PayAsYouGo;
  const date = tenant.periodEnd ? formatDate(tenant.periodEnd, i18n.language) : '';

  if (payg && !isOwner) return null;
  if (!payg && (!subscribed || cancelled)) return null;

  const mutation = confirming === 'close' ? closeShop : cancel;

  return (
    <>
      <details className="group rounded-card border border-line bg-white shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] text-ink [&::-webkit-details-marker]:hidden">
          {payg ? t('plan.closeShopTitle') : t('plan.stopTitle')}
          <span className="text-neutral-400 transition-transform group-open:rotate-90">
            <Icon name="next" size={18} />
          </span>
        </summary>
        <div className="space-y-3 px-4 pb-4">
          <p className="text-[14px] text-neutral-700">
            {payg ? t('plan.closeShopLead') : t('plan.stopLead', { date })}
          </p>
          <Button
            type="button"
            tone="danger"
            fit
            onClick={() => {
              setConfirming(payg ? 'close' : 'cancel');
            }}
          >
            {payg ? t('plan.closeShop') : t('plan.cancelAtEnd')}
          </Button>
        </div>
      </details>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === 'close'
            ? t('plan.closeConfirmTitle', { shop: tenant.shopName })
            : t('plan.cancelConfirmTitle', { shop: tenant.shopName })
        }
        message={
          confirming === 'close'
            ? t('plan.closeConfirmLead')
            : t('plan.cancelConfirmLead', { date })
        }
        error={mutation.isError ? errorMessage(mutation.error, t) : null}
        confirmLabel={confirming === 'close' ? t('plan.closeShop') : t('plan.cancelAtEnd')}
        danger
        pending={mutation.isPending}
        onConfirm={() => {
          mutation.mutate(undefined, {
            onSuccess: () => {
              setConfirming(null);
              if (confirming === 'close') onClosed();
              else onCancelled();
            },
          });
        }}
        onCancel={() => {
          setConfirming(null);
          mutation.reset();
        }}
      />
    </>
  );
}
