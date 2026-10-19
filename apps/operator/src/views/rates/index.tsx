import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { RateKey } from '@lytronix/validators';
import { useRateHistory, useRates, useUpdateRate } from '@/api/rates';
import { errorMessage } from '@lytronix/api-client';
import {
  Button,
  Card,
  EmptyLine,
  ErrorBanner,
  formatDate,
  formatDateTime,
  Page,
  PageHeader,
  TextField,
} from '@lytronix/ui';
import type { RateValue } from '@/types/operator';

/** RAT-02/08/09: seven rates, each one number, edited in place with its history under the row. */
export function Rates(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const rates = useRates();
  const updateRate = useUpdateRate();
  const [editing, setEditing] = useState<RateKey | null>(null);
  const [draft, setDraft] = useState('');
  const [historyKey, setHistoryKey] = useState<RateKey | null>(null);
  const history = useRateHistory(historyKey);

  function startEdit(rate: RateValue): void {
    updateRate.reset();
    setDraft(rate.value);
    setEditing(rate.key);
  }

  function cancelEdit(): void {
    updateRate.reset();
    setEditing(null);
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!editing) return;
    updateRate.mutate({ key: editing, value: Number(draft) }, { onSuccess: cancelEdit });
  }

  return (
    <Page narrow>
      <PageHeader title={t('rates.title')} lead={t('rates.lead')} />
      {rates.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {rates.isError ? <ErrorBanner message={errorMessage(rates.error, t)} /> : null}
      {rates.data?.map((rate) => (
        <Card key={rate.key}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-fg">{t(`rateNames.${rate.key}`)}</p>
              <p className="text-[13px] text-fg-muted">
                {t('rates.effectiveFrom', { date: formatDate(rate.effectiveFrom, i18n.language) })}
              </p>
            </div>
            {editing === rate.key ? null : (
              <div className="flex items-center gap-3">
                <span className="num text-[20px] font-bold text-fg">{rate.value}</span>
                <Button
                  type="button"
                  tone="outline"
                  small
                  fit
                  onClick={() => {
                    startEdit(rate);
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  tone="ghost"
                  small
                  fit
                  aria-expanded={historyKey === rate.key}
                  onClick={() => {
                    setHistoryKey((current) => (current === rate.key ? null : rate.key));
                  }}
                >
                  {t('rates.history')}
                </Button>
              </div>
            )}
          </div>

          {editing === rate.key ? (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <TextField
                label={t('rates.newValue')}
                name="value"
                type="number"
                step="0.01"
                min={0}
                required
                autoFocus
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
              />
              {updateRate.isError ? (
                <ErrorBanner message={errorMessage(updateRate.error, t)} />
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" fit loading={updateRate.isPending}>
                  {t('common.save')}
                </Button>
                <Button type="button" tone="outline" fit onClick={cancelEdit}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          ) : null}

          {historyKey === rate.key ? (
            <div className="mt-4 border-t border-line pt-3">
              {history.isLoading ? (
                <p className="text-[13px] text-fg-muted">{t('common.loading')}</p>
              ) : null}
              {history.data && history.data.length === 0 ? (
                <p className="text-[13px] text-fg-muted">{t('rates.noHistory')}</p>
              ) : null}
              {history.data && history.data.length > 0 ? (
                <ul className="num space-y-1 text-[13px] text-fg-muted">
                  {history.data.map((entry) => (
                    <li key={entry.id}>
                      {t('rates.historyLine', {
                        old: entry.oldValue ?? '–',
                        new: entry.newValue,
                        date: formatDateTime(entry.changedAt, i18n.language),
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>
      ))}
    </Page>
  );
}
