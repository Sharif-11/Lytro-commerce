import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { SelectField, TextField } from '@lytronix/ui';
import { useAssignPlan, usePlans } from '@/api/plans';
import { useAdjustBalance, useRestoreShop, useSuspendShop } from '@/api/shops';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { MoneyField } from '@/components/ui/money-field';
import { ReasonField } from '@/components/ui/reason-field';
import { useToast } from '@/components/ui/use-toast';
import { taka } from '@/lib/format';
import type { OperatorShop } from '@/types/operator';

interface ShopPanelProps {
  shop: OperatorShop;
  onClose: () => void;
}

/** LIF-24: the storefront goes offline; the owner keeps the dashboard and sees the reason. */
export function SuspendPanel({ shop, onClose }: ShopPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const suspend = useSuspendShop();
  const [reason, setReason] = useState('');
  return (
    <ActionPanel
      title={t('shop.suspendTitle', { shop: shop.shopName })}
      sub={`${shop.slug}.lytro.app`}
      onClose={onClose}
      actionLabel={t('shop.suspendButton')}
      danger
      pending={suspend.isPending}
      canSubmit={reason.trim() !== ''}
      error={suspend.isError ? errorMessage(suspend.error, t) : null}
      onSubmit={() => {
        suspend.mutate({ shopId: shop.id, reason: reason.trim() }, { onSuccess: onClose });
      }}
    >
      <Consequence tone="danger">{t('shop.suspendConsequence')}</Consequence>
      <ReasonField label={t('shop.suspendReason')} value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

export function RestorePanel({ shop, onClose }: ShopPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const restore = useRestoreShop();
  return (
    <ActionPanel
      title={t('shop.restoreTitle', { shop: shop.shopName })}
      onClose={onClose}
      actionLabel={t('shop.restoreButton')}
      pending={restore.isPending}
      error={restore.isError ? errorMessage(restore.error, t) : null}
      onSubmit={() => {
        restore.mutate(
          { shopId: shop.id },
          {
            onSuccess: () => {
              toast(t('shop.restored'));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence tone="ok">{t('shop.restoreConsequence')}</Consequence>
      <KeyValues>
        <KeyValue label={t('shop.reason')}>{shop.suspension?.reason ?? '—'}</KeyValue>
      </KeyValues>
    </ActionPanel>
  );
}

/** BAL-12: a correction, not a refund; negative takes money off. */
export function AdjustPanel({ shop, onClose }: ShopPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const adjust = useAdjustBalance();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const typed = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(typed) && typed !== 0;
  return (
    <ActionPanel
      title={t('shop.adjustTitle')}
      sub={shop.shopName}
      onClose={onClose}
      actionLabel={t('shop.adjustButton')}
      pending={adjust.isPending}
      canSubmit={valid && reason.trim() !== ''}
      error={adjust.isError ? errorMessage(adjust.error, t) : null}
      onSubmit={() => {
        adjust.mutate(
          { shopId: shop.id, amount: typed, reason: reason.trim() },
          {
            onSuccess: (entry) => {
              toast(t('shop.adjusted', { b: taka(entry.balanceAfter) }));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence>{t('shop.adjustConsequence')}</Consequence>
      <MoneyField label={t('shop.amount')} name="amount" value={amount} onChange={setAmount} />
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

/** PLN-17: on the plan now, without payment; with an expiry it lapses into grace on that date. */
export function AssignPanel({ shop, onClose }: ShopPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const plans = usePlans();
  const assign = useAssignPlan();
  const [planId, setPlanId] = useState(shop.planId ?? '');
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const options = plans.data ?? [];
  const chosen = planId || options[0]?.id || '';
  return (
    <ActionPanel
      title={t('shop.assignTitle')}
      sub={shop.shopName}
      onClose={onClose}
      actionLabel={t('shop.assignButton')}
      pending={assign.isPending}
      canSubmit={chosen !== '' && reason.trim() !== ''}
      error={assign.isError ? errorMessage(assign.error, t) : null}
      onSubmit={() => {
        assign.mutate(
          {
            planId: chosen,
            tenantId: shop.id,
            expiry: expiry === '' ? undefined : new Date(expiry),
            reason: reason.trim(),
          },
          {
            onSuccess: () => {
              toast(
                t('shop.assigned', {
                  shop: shop.shopName,
                  plan: options.find((plan) => plan.id === chosen)?.name ?? '',
                }),
              );
              onClose();
            },
          },
        );
      }}
    >
      <Consequence>{t('shop.assignConsequence')}</Consequence>
      <SelectField
        label={t('shop.assignPlan')}
        name="plan"
        value={chosen}
        onChange={(event) => {
          setPlanId(event.target.value);
        }}
      >
        {options.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name} v{plan.version}
            {plan.forSale ? '' : ` · ${t('shop.notForSale')}`}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t('shop.expiry')}
        name="expiry"
        type="date"
        hint={t('shop.expiryHelp')}
        value={expiry}
        onChange={(event) => {
          setExpiry(event.target.value);
        }}
      />
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}
