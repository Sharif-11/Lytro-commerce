import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssignPlan, usePlans } from '@/api/plans';
import {
  useAdjustBalance,
  useLimitOverrides,
  useRemoveLimitOverride,
  useRestoreTenant,
  useSetLimitOverride,
  useSuspendTenant,
} from '@/api/tenants';
import { errorMessage } from '@lytronix/api-client';
import {
  Button,
  Card,
  CardTitle,
  CheckboxRow,
  ConfirmDialog,
  Detail,
  ErrorBanner,
  formatDate,
  formatDateTime,
  formatTakaExact,
  Notice,
  SelectField,
  Tag,
  TextArea,
  TextField,
} from '@lytronix/ui';
import { useCopy } from '@/lib/use-copy';
import { canBeUnlimited, LIMIT_KEYS, limitLabelKey, type LimitKey } from '@/lib/limit-keys';
import type { TenantSummary } from '@/types/operator';

interface TenantPanelProps {
  tenant: TenantSummary;
  onClose: () => void;
}

/** Everything the console can do to one shop, under its summary. Each form owns its own mutation. */
export function TenantPanel({ tenant, onClose }: TenantPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [copied, copy] = useCopy();

  const suspend = useSuspendTenant();
  const restore = useRestoreTenant();
  const [suspending, setSuspending] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const adjust = useAdjustBalance();
  const [amount, setAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const overrides = useLimitOverrides(tenant.id);
  const setOverride = useSetLimitOverride();
  const removeOverride = useRemoveLimitOverride();
  const [limitKey, setLimitKey] = useState<LimitKey>(LIMIT_KEYS[0] ?? 'products');
  const [limitValue, setLimitValue] = useState('');
  const [limitUnlimited, setLimitUnlimited] = useState(false);
  const [limitReason, setLimitReason] = useState('');

  const plans = usePlans();
  const assign = useAssignPlan();
  const [planId, setPlanId] = useState('');
  const [expiry, setExpiry] = useState('');
  const [assignReason, setAssignReason] = useState('');

  function handleAdjust(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    adjust.mutate(
      { tenantId: tenant.id, amount: Number(amount), reason: adjustReason.trim() },
      {
        onSuccess: () => {
          setAmount('');
          setAdjustReason('');
        },
      },
    );
  }

  function handleOverride(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setOverride.mutate(
      {
        tenantId: tenant.id,
        limitKey,
        value: canBeUnlimited(limitKey) && limitUnlimited ? null : Number(limitValue),
        reason: limitReason.trim(),
      },
      {
        onSuccess: () => {
          setLimitValue('');
          setLimitUnlimited(false);
          setLimitReason('');
        },
      },
    );
  }

  function handleAssign(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!planId) return;
    assign.mutate(
      {
        planId,
        tenantId: tenant.id,
        expiry: expiry === '' ? undefined : new Date(expiry),
        reason: assignReason.trim(),
      },
      {
        onSuccess: () => {
          setAssignReason('');
          setExpiry('');
        },
      },
    );
  }

  return (
    <Card className="space-y-6 border-brand-400/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="heading flex flex-wrap items-center gap-2 text-[20px] text-fg">
            {tenant.shopName}
            <Tag tone="brand">{t(`states.${tenant.state}`)}</Tag>
            {tenant.suspendedAt ? <Tag tone="danger">{t('tenants.suspended')}</Tag> : null}
          </h2>
          <p className="num text-[13px] text-fg-muted">
            {tenant.slug}
            {tenant.planName ? ` · ${tenant.planName}` : ''}
            {tenant.periodEnd
              ? ` · ${t('tenants.periodEnd', { date: formatDate(tenant.periodEnd, i18n.language) })}`
              : ''}
          </p>
          <button
            type="button"
            onClick={() => {
              copy(tenant.id);
            }}
            className="mono mt-1 text-[12px] text-fg-muted hover:text-fg"
          >
            {tenant.id} · {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
        <Button type="button" tone="ghost" small fit onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>

      {tenant.suspendedAt ? (
        <Notice tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {t('tenants.suspendedSince', {
                date: formatDateTime(tenant.suspendedAt, i18n.language),
              })}
            </span>
            <Button
              type="button"
              tone="outline"
              small
              fit
              loading={restore.isPending}
              onClick={() => {
                restore.mutate(tenant.id);
              }}
            >
              {t('tenants.restore')}
            </Button>
          </div>
          {restore.isError ? (
            <div className="mt-2">
              <ErrorBanner message={errorMessage(restore.error, t)} />
            </div>
          ) : null}
        </Notice>
      ) : (
        <div>
          <Button
            type="button"
            tone="danger"
            small
            fit
            onClick={() => {
              suspend.reset();
              setSuspendReason('');
              setSuspending(true);
            }}
          >
            {t('tenants.suspend')}
          </Button>
        </div>
      )}

      <section className="border-t border-line pt-5">
        <CardTitle>{t('tenants.adjustTitle')}</CardTitle>
        <p className="mt-1 text-[13px] text-fg-muted">{t('tenants.adjustLead')}</p>
        <form
          onSubmit={handleAdjust}
          className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end"
        >
          <TextField
            label={t('tenants.amount')}
            name="amount"
            type="number"
            step="0.01"
            required
            leading="৳"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
          <TextField
            label={t('tenants.reason')}
            name="adjustReason"
            required
            value={adjustReason}
            onChange={(event) => {
              setAdjustReason(event.target.value);
            }}
          />
          <Button type="submit" tone="outline" loading={adjust.isPending}>
            {t('tenants.adjust')}
          </Button>
        </form>
        {adjust.isError ? (
          <div className="mt-2">
            <ErrorBanner message={errorMessage(adjust.error, t)} />
          </div>
        ) : null}
        {adjust.data ? (
          <Notice tone="success" className="mt-2">
            {t('tenants.adjusted', { balance: formatTakaExact(adjust.data.balanceAfter) })}
          </Notice>
        ) : null}
      </section>

      <section className="border-t border-line pt-5">
        <CardTitle>{t('tenants.overridesTitle')}</CardTitle>
        <p className="mt-1 text-[13px] text-fg-muted">{t('tenants.overridesLead')}</p>
        {overrides.data && overrides.data.length > 0 ? (
          <ul className="mt-3 divide-y divide-line rounded-control border border-line">
            {overrides.data.map((override) => (
              <li key={override.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="num text-[14px] text-fg">
                    {t(limitLabelKey(override.limitKey), { defaultValue: override.limitKey })}:{' '}
                    <strong>
                      {override.value === null ? t('plans.unlimited') : String(override.value)}
                    </strong>
                  </p>
                  <p className="text-[12px] text-fg-muted">{override.reason}</p>
                </div>
                <Button
                  type="button"
                  tone="ghost"
                  small
                  fit
                  loading={
                    removeOverride.isPending &&
                    removeOverride.variables.limitKey === override.limitKey
                  }
                  onClick={() => {
                    removeOverride.mutate({ tenantId: tenant.id, limitKey: override.limitKey });
                  }}
                >
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {overrides.data && overrides.data.length === 0 ? (
          <p className="mt-3 text-[13px] text-fg-muted">{t('tenants.noOverrides')}</p>
        ) : null}
        <form onSubmit={handleOverride} className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('tenants.limitKey')}
            name="limitKey"
            value={limitKey}
            onChange={(event) => {
              setLimitKey(event.target.value as LimitKey);
              setLimitUnlimited(false);
            }}
          >
            {LIMIT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(limitLabelKey(key))}
              </option>
            ))}
          </SelectField>
          <div>
            <TextField
              label={t('tenants.limitValue')}
              name="limitValue"
              type="number"
              min={0}
              required={!limitUnlimited}
              disabled={limitUnlimited}
              value={limitUnlimited ? '' : limitValue}
              onChange={(event) => {
                setLimitValue(event.target.value);
              }}
            />
            {canBeUnlimited(limitKey) ? (
              <CheckboxRow
                label={<span className="text-[13px]">{t('plans.unlimited')}</span>}
                checked={limitUnlimited}
                onChange={setLimitUnlimited}
              />
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <TextField
              label={t('tenants.reason')}
              name="limitReason"
              required
              value={limitReason}
              onChange={(event) => {
                setLimitReason(event.target.value);
              }}
            />
          </div>
          {setOverride.isError ? (
            <div className="sm:col-span-2">
              <ErrorBanner message={errorMessage(setOverride.error, t)} />
            </div>
          ) : null}
          <div>
            <Button type="submit" tone="outline" fit loading={setOverride.isPending}>
              {t('tenants.setOverride')}
            </Button>
          </div>
        </form>
      </section>

      <section className="border-t border-line pt-5">
        <CardTitle>{t('tenants.assignTitle')}</CardTitle>
        <p className="mt-1 text-[13px] text-fg-muted">{t('tenants.assignLead')}</p>
        <form onSubmit={handleAssign} className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('tenants.plan')}
            name="planId"
            required
            value={planId}
            onChange={(event) => {
              setPlanId(event.target.value);
            }}
          >
            <option value="">{t('tenants.choosePlan')}</option>
            {plans.data?.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('tenants.expiry')}
            name="expiry"
            type="date"
            hint={t('tenants.expiryHint')}
            value={expiry}
            onChange={(event) => {
              setExpiry(event.target.value);
            }}
          />
          <div className="sm:col-span-2">
            <TextField
              label={t('tenants.reason')}
              name="assignReason"
              required
              value={assignReason}
              onChange={(event) => {
                setAssignReason(event.target.value);
              }}
            />
          </div>
          {assign.isError ? (
            <div className="sm:col-span-2">
              <ErrorBanner message={errorMessage(assign.error, t)} />
            </div>
          ) : null}
          {assign.data ? (
            <div className="sm:col-span-2">
              <Notice tone="success">{t('tenants.assigned')}</Notice>
            </div>
          ) : null}
          <div>
            <Button type="submit" tone="outline" fit loading={assign.isPending}>
              {t('tenants.assign')}
            </Button>
          </div>
        </form>
      </section>

      <div className="grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
        <Detail label={t('tenants.planId')}>
          <span className="mono text-[12px]">{tenant.planId ?? '–'}</span>
        </Detail>
      </div>

      <ConfirmDialog
        open={suspending}
        title={t('tenants.suspendTitle', { name: tenant.shopName })}
        message={
          <TextArea
            label={t('tenants.suspendReason')}
            name="suspendReason"
            required
            value={suspendReason}
            onChange={(event) => {
              setSuspendReason(event.target.value);
            }}
          />
        }
        error={suspend.isError ? errorMessage(suspend.error, t) : null}
        confirmLabel={t('tenants.suspend')}
        danger
        pending={suspend.isPending}
        onConfirm={() => {
          if (suspendReason.trim() === '') return;
          suspend.mutate(
            { tenantId: tenant.id, reason: suspendReason.trim() },
            {
              onSuccess: () => {
                setSuspending(false);
              },
            },
          );
        }}
        onCancel={() => {
          setSuspending(false);
          suspend.reset();
        }}
      />
    </Card>
  );
}
