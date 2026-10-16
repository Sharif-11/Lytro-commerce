import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { RateKey } from '@lytronix/validators';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import type { RateValue } from '@/types/balance';
import type { RateHistoryEntry } from '@/types/billing-admin';

const RATE_LABEL_KEYS: Record<RateKey, string> = {
  [RateKey.SmsPerUnit]: 'balance.rate.smsPerUnit',
  [RateKey.AiReply]: 'balance.rate.aiReply',
  [RateKey.FraudCheck]: 'balance.rate.fraudCheck',
  [RateKey.PaygOrderFeeMin]: 'balance.rate.paygOrderFeeMin',
  [RateKey.PaygOrderFeePct]: 'balance.rate.paygOrderFeePct',
  [RateKey.PaygProductFee]: 'balance.rate.paygProductFee',
  [RateKey.SmsUnitSizeChars]: 'balance.rate.smsUnitSizeChars',
};

interface RateListProps {
  rates: RateValue[];
  editingKey: RateKey | null;
  onStartEdit: (key: RateKey) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (value: number) => void;
  editPending: boolean;
  editError: string | null;
  historyKey: RateKey | null;
  onToggleHistory: (key: RateKey) => void;
  history: RateHistoryEntry[] | undefined;
  historyLoading: boolean;
}

/** RAT-02/08/09: one row per rate, edited in place rather than through a separate form screen — there are
    only seven of these and each is a single number, so a modal/panel would be more chrome than content. */
export function RateList({
  rates,
  editingKey,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  editPending,
  editError,
  historyKey,
  onToggleHistory,
  history,
  historyLoading,
}: RateListProps): React.JSX.Element {
  const { t } = useTranslation();
  const [draftValue, setDraftValue] = useState('');

  function startEdit(rate: RateValue): void {
    setDraftValue(rate.value);
    onStartEdit(rate.key);
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmitEdit(Number(draftValue));
  }

  return (
    <div className="space-y-3">
      {rates.map((rate) => (
        <div key={rate.key} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-slate-900">{t(RATE_LABEL_KEYS[rate.key])}</p>
              <p className="text-xs text-slate-400">
                {t('balance.ratesEffectiveFrom', {
                  date: new Date(rate.effectiveFrom).toLocaleDateString(),
                })}
              </p>
            </div>

            {editingKey === rate.key ? null : (
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-slate-900">{rate.value}</span>
                <button
                  type="button"
                  onClick={() => {
                    startEdit(rate);
                  }}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleHistory(rate.key);
                  }}
                  className="text-sm font-medium text-slate-500 hover:underline"
                >
                  {t('operator.rates.history')}
                </button>
              </div>
            )}
          </div>

          {editingKey === rate.key ? (
            <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-2">
              <TextField
                label={t('operator.rates.newValue')}
                name="value"
                type="number"
                step="0.01"
                min={0}
                required
                value={draftValue}
                onChange={(event) => {
                  setDraftValue(event.target.value);
                }}
              />
              <Button type="submit" loading={editPending} className="w-auto!">
                {t('common.save')}
              </Button>
              <Button type="button" variant="outline" onClick={onCancelEdit} className="w-auto!">
                {t('common.cancel')}
              </Button>
            </form>
          ) : null}
          {editingKey === rate.key && editError ? (
            <div className="mt-2">
              <ErrorBanner message={editError} />
            </div>
          ) : null}

          {historyKey === rate.key ? (
            <div className="mt-3 border-t border-dashed border-slate-100 pt-3">
              {historyLoading ? (
                <p className="text-sm text-slate-500">{t('common.loading')}</p>
              ) : null}
              {!historyLoading && (!history || history.length === 0) ? (
                <p className="text-sm text-slate-400">{t('operator.rates.noHistory')}</p>
              ) : null}
              {history && history.length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-600">
                  {history.map((entry) => (
                    <li key={entry.id}>
                      {t('operator.rates.historyLine', {
                        old: entry.oldValue ?? '-',
                        new: entry.newValue,
                        date: new Date(entry.changedAt).toLocaleString(),
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
