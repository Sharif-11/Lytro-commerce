import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { TextField } from '@lytronix/ui';
import { cloudflarePricesSchema, type CloudflarePrices } from '@lytronix/validators';
import { useUpdateSetting } from '@/api/settings';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { MoneyField } from '@/components/ui/money-field';
import { ReasonField } from '@/components/ui/reason-field';
import { pricesOf } from '@/lib/setting-words';
import type { PlatformSetting } from '@/types/operator';

type PriceKey = keyof CloudflarePrices;

/** The nine figures in the order the sheet draws them; a price carries a dollar sign, an allowance doesn't. */
const FIELDS: readonly { key: PriceKey; price: boolean }[] = [
  { key: 'r2ClassAPerMillion', price: true },
  { key: 'r2ClassBPerMillion', price: true },
  { key: 'r2StoragePerGbMonth', price: true },
  { key: 'r2FreeClassAMillions', price: false },
  { key: 'r2FreeClassBMillions', price: false },
  { key: 'r2FreeStorageGbMonths', price: false },
  { key: 'workersMonthly', price: true },
  { key: 'workersIncludedMillions', price: false },
  { key: 'workersPerMillion', price: true },
];

/**
 * D8-60 (Slice 8.8): Cloudflare's R2 and Workers prices and monthly allowances, which the media costs estimate uses,
 * changed together with one reason when Cloudflare changes them.
 */
export function PricesPanel({
  setting,
  onClose,
  onSaved,
}: {
  setting: PlatformSetting;
  onClose: () => void;
  onSaved: (sent: CloudflarePrices) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdateSetting();
  const saved = pricesOf(setting.value);
  const [words, setWords] = useState<Record<PriceKey, string>>(
    () =>
      Object.fromEntries(FIELDS.map(({ key }) => [key, String(saved[key])])) as Record<
        PriceKey,
        string
      >,
  );
  const [reason, setReason] = useState('');
  const [refused, setRefused] = useState(false);

  return (
    <ActionPanel
      title={t('settingNames.cloudflare_prices')}
      sub={t('settings.pricesLead')}
      onClose={onClose}
      actionLabel={t('common.save')}
      pending={update.isPending}
      canSubmit={reason.trim() !== ''}
      error={update.isError ? errorMessage(update.error, t) : null}
      onSubmit={() => {
        const typed = Object.fromEntries(
          FIELDS.map(({ key }) => [
            key,
            words[key].trim() === '' ? Number.NaN : Number(words[key]),
          ]),
        );
        const parsed = cloudflarePricesSchema.safeParse(typed);
        if (!parsed.success) {
          setRefused(true);
          return;
        }
        update.mutate(
          { key: setting.key, value: parsed.data, reason: reason.trim() },
          {
            onSuccess: () => {
              onSaved(parsed.data);
            },
          },
        );
      }}
    >
      {refused ? (
        <Banner tone="bad" icon="warn">
          {t('settings.pricesError')}
        </Banner>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, price }) => {
          const change = (next: string): void => {
            setWords((current) => ({ ...current, [key]: next }));
            setRefused(false);
          };
          return price ? (
            <MoneyField
              key={key}
              sign="$"
              label={t(`settings.prices.${key}`)}
              name={key}
              startHere={false}
              value={words[key]}
              onChange={change}
            />
          ) : (
            <TextField
              key={key}
              label={t(`settings.prices.${key}`)}
              name={key}
              mono
              inputMode="numeric"
              value={words[key]}
              onChange={(event) => {
                change(event.target.value);
              }}
            />
          );
        })}
      </div>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}
