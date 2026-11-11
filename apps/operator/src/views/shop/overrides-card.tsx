import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, CheckboxRow, SelectField, TextField } from '@lytronix/ui';
import {
  useLimitOverrides,
  useRemoveLimitOverride,
  useSetLimitOverride,
  useShopAddons,
} from '@/api/shops';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsoleCard } from '@/components/ui/console-page';
import { CardList, LIST_ROW, RowLines } from '@/components/ui/list-row';
import { ReasonField } from '@/components/ui/reason-field';
import { QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import { canBeUnlimited, LIMIT_KEYS, limitLabelKey, type LimitKey } from '@/lib/limit-keys';
import { limitValue } from '@/lib/limit-words';
import type { OperatorShop, PlanLimitOverride } from '@/types/operator';

/** PLN-11: one limit of the plan replaced for this shop; removing it later restores the plan's value. */
function OverridePanel({
  shop,
  planValueOf,
  onClose,
}: {
  shop: OperatorShop;
  planValueOf: (key: string) => unknown;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const set = useSetLimitOverride();
  const [limitKey, setLimitKey] = useState<LimitKey>(LIMIT_KEYS[0] ?? 'products');
  const [value, setValue] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [reason, setReason] = useState('');
  const allowsUnlimited = canBeUnlimited(limitKey);
  const isUnlimited = allowsUnlimited && unlimited;
  const valid = isUnlimited || (value.trim() !== '' && Number.isFinite(Number(value)));
  return (
    <ActionPanel
      title={t('shop.overrideTitle')}
      sub={`${shop.shopName}${shop.planName ? ` · ${shop.planName} v${String(shop.planVersion)}` : ''}`}
      onClose={onClose}
      actionLabel={t('shop.overrideButton')}
      pending={set.isPending}
      canSubmit={valid && reason.trim() !== ''}
      error={set.isError ? errorMessage(set.error, t) : null}
      onSubmit={() => {
        set.mutate(
          {
            shopId: shop.id,
            limitKey,
            value: isUnlimited ? null : Number(value),
            reason: reason.trim(),
          },
          {
            onSuccess: () => {
              toast(t('shop.overrideSet'));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence>{t('shop.overrideConsequence')}</Consequence>
      <SelectField
        label={t('shop.limit')}
        name="limit"
        value={limitKey}
        onChange={(event) => {
          setLimitKey(event.target.value as LimitKey);
        }}
      >
        {LIMIT_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(limitLabelKey(key))} ·{' '}
            {t('shop.overridePlan', { v: limitValue(planValueOf(key), t) })}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label={t('shop.value')}
          name="value"
          inputMode="numeric"
          mono
          disabled={isUnlimited}
          value={isUnlimited ? '' : value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        {allowsUnlimited ? (
          <div className="flex items-end">
            <CheckboxRow label={t('shop.unlimited')} checked={unlimited} onChange={setUnlimited} />
          </div>
        ) : null}
      </div>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

function RemovePanel({
  shop,
  override,
  onClose,
}: {
  shop: OperatorShop;
  override: PlanLimitOverride;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useRemoveLimitOverride();
  const [reason, setReason] = useState('');
  return (
    <ActionPanel
      title={t('shop.removeTitle')}
      sub={shop.shopName}
      onClose={onClose}
      actionLabel={t('shop.remove')}
      danger
      pending={remove.isPending}
      canSubmit={reason.trim() !== ''}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      onSubmit={() => {
        remove.mutate(
          { shopId: shop.id, limitKey: override.limitKey, reason: reason.trim() },
          {
            onSuccess: () => {
              toast(t('shop.removed'));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence tone="danger">
        {t('shop.removeConsequence', {
          limit: t(limitLabelKey(override.limitKey)),
          shop: shop.shopName,
        })}
      </Consequence>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

/** The shop's limit overrides, each with why, when and who. */
export function OverridesCard({
  shop,
  adding,
  onAdd,
}: {
  shop: OperatorShop;
  adding: boolean;
  onAdd: (open: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const overrides = useLimitOverrides(shop.id);
  const addons = useShopAddons(shop.id);
  const [removing, setRemoving] = useState<PlanLimitOverride | null>(null);

  function planValueOf(key: string): unknown {
    return addons.data?.limits.find((part) => part.key === key)?.plan;
  }

  return (
    <ConsoleCard>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="mb-1 text-[16px] font-semibold">{t('shop.overridesTitle')}</h2>
        <button
          type="button"
          onClick={() => {
            onAdd(true);
          }}
          className="inline-flex items-center gap-1 text-[14px] font-medium whitespace-nowrap text-primary"
        >
          <ConsoleIcon name="plus" size={18} />
          {t('shop.addOverride')}
        </button>
      </div>
      <div className="text-[13px] text-fg-muted">{t('shop.overridesHint')}</div>
      {overrides.data?.length ? (
        <CardList>
          {overrides.data.map((override) => (
            <div key={override.limitKey} className={LIST_ROW}>
              <RowLines
                wrap
                title={
                  <>
                    {t(limitLabelKey(override.limitKey))}:{' '}
                    <b className="font-semibold">{limitValue(override.value, t)}</b>{' '}
                    <span className="font-normal text-fg-muted">
                      ·{' '}
                      {t('shop.overridePlan', { v: limitValue(planValueOf(override.limitKey), t) })}
                    </span>
                  </>
                }
                detail={`${override.reason} · ${formatDay(override.setAt)}${
                  override.setByEmail ? ` · ${override.setByEmail}` : ''
                }`}
              />
              <Button
                type="button"
                tone="ghost"
                small
                fit
                className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
                onClick={() => {
                  setRemoving(override);
                }}
              >
                {t('shop.remove')}
              </Button>
            </div>
          ))}
        </CardList>
      ) : (
        <div className="mt-2 text-[13px] leading-[1.55] text-fg-muted">
          {overrides.data ? t('shop.overridesNone') : null}
        </div>
      )}
      {adding ? (
        <OverridePanel
          shop={shop}
          planValueOf={planValueOf}
          onClose={() => {
            onAdd(false);
          }}
        />
      ) : null}
      {removing ? (
        <RemovePanel
          shop={shop}
          override={removing}
          onClose={() => {
            setRemoving(null);
          }}
        />
      ) : null}
    </ConsoleCard>
  );
}
