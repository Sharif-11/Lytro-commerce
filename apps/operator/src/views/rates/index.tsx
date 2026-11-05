import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { RateKey } from '@lytronix/validators';
import { useRateHistory, useRates, useUpdateRate } from '@/api/rates';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle, SoonTag } from '@/components/ui/console-page';
import { InlineForm } from '@/components/ui/inline-form';
import { RowIcon, RowLines } from '@/components/ui/list-row';
import { LoadFailed } from '@/components/ui/load-failed';
import { INLINE_FIELD, LARGE_VALUE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import type { RateValue } from '@/types/operator';
import { RATE_UNITS, rateWords } from './rate-words';

const UNDER_THE_ROW =
  'flex flex-col gap-2 border-t border-line bg-neutral-50 px-4 py-3 text-[13px]';
const KEYS = Object.values(RateKey);
// A phone gives the name its own line, beside the icon: on one line with the value and buttons, it had no room.
const ROW_WORDS = 'basis-[calc(100%-52px)] sm:basis-0';

function RateEditor({
  rate,
  onCancel,
  onSaved,
}: {
  rate: RateValue;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdateRate();
  const [value, setValue] = useState(String(Number(rate.value)));
  const [reason, setReason] = useState('');
  return (
    <InlineForm
      reason={reason}
      onReason={setReason}
      pending={update.isPending}
      canSave={value.trim() !== ''}
      error={update.isError ? errorMessage(update.error, t) : null}
      onCancel={onCancel}
      onSubmit={() => {
        update.mutate(
          { key: rate.key, value: Number(value), reason: reason.trim() },
          { onSuccess: onSaved },
        );
      }}
    >
      <input
        name="value"
        aria-label={t(`rateNames.${rate.key}`)}
        inputMode="decimal"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        className={`${INLINE_FIELD} mono w-[110px] text-right`}
      />
    </InlineForm>
  );
}

function RateHistory({ rate }: { rate: RateValue }): React.JSX.Element {
  const { t } = useTranslation();
  const history = useRateHistory(rate.key);
  const lines = [...(history.data ?? [])].sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  return (
    <div className={UNDER_THE_ROW}>
      {history.isError ? (
        <LoadFailed
          onRetry={() => {
            void history.refetch();
          }}
        />
      ) : history.isLoading ? (
        <span className="skel w-3/5" />
      ) : lines.length === 0 ? (
        <span className="text-fg-muted">{t('rates.noHistory')}</span>
      ) : (
        lines.map((line) => (
          <div key={line.id} className="flex flex-wrap justify-between gap-3">
            <span className="tabular-nums">
              {line.oldValue === null ? '–' : rateWords(rate.key, line.oldValue)} →{' '}
              {rateWords(rate.key, line.newValue)}
            </span>
            <span className="text-fg-muted">
              {[
                formatDay(line.changedAt),
                line.changedByEmail,
                t(line.noticeId ? 'rates.withNotice' : 'rates.noNotice'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/** OPERATOR-CONSOLE-DESIGN §8: the per-use charges, changed in their rows. */
export function Rates(): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const rates = useRates();
  const [editing, setEditing] = useState<RateKey | null>(null);
  const [showing, setShowing] = useState<RateKey | null>(null);
  const [offering, setOffering] = useState<RateKey | null>(null);
  const rows = [...(rates.data ?? [])].sort((a, b) => KEYS.indexOf(a.key) - KEYS.indexOf(b.key));
  return (
    <ConsolePage>
      <PageTitle title={t('nav.rates')} lead={t('rates.lead')} />
      {rates.isError ? (
        <LoadFailed
          onRetry={() => {
            void rates.refetch();
          }}
        />
      ) : rates.isLoading ? (
        <section
          aria-busy="true"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
        >
          <span className="skel w-4/5" />
          <span className="skel w-3/5" />
        </section>
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface">
          {rows.map((rate) => (
            <div key={rate.key} className="border-t border-line first:border-t-0">
              <div className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <RowIcon name="signal" />
                <RowLines
                  wrap
                  className={ROW_WORDS}
                  title={t(`rateNames.${rate.key}`, { defaultValue: rate.key })}
                  detail={`${t(`rates.units.${RATE_UNITS[rate.key]}`)} · ${t('rates.since', {
                    d: formatDay(rate.effectiveFrom),
                  })}`}
                />
                {editing === rate.key ? (
                  <RateEditor
                    rate={rate}
                    onCancel={() => {
                      setEditing(null);
                    }}
                    onSaved={() => {
                      setEditing(null);
                      setOffering(rate.key);
                      toast(t('rates.saved'));
                    }}
                  />
                ) : (
                  <>
                    <span className={`${LARGE_VALUE} ml-[52px] min-w-20 sm:ml-0 sm:text-right`}>
                      {rateWords(rate.key, rate.value)}
                    </span>
                    <span className="ml-auto flex gap-1 sm:ml-0">
                      <Button
                        type="button"
                        tone="outline"
                        small
                        fit
                        className={SMALL_BUTTON}
                        aria-label={`${t('rates.change')}: ${t(`rateNames.${rate.key}`)}`}
                        onClick={() => {
                          setEditing(rate.key);
                          setOffering(null);
                        }}
                      >
                        {t('rates.change')}
                      </Button>
                      <Button
                        type="button"
                        tone="ghost"
                        small
                        fit
                        aria-expanded={showing === rate.key}
                        aria-label={`${t('rates.history')}: ${t(`rateNames.${rate.key}`)}`}
                        className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
                        onClick={() => {
                          setShowing(showing === rate.key ? null : rate.key);
                        }}
                      >
                        {t('rates.history')}
                      </Button>
                    </span>
                  </>
                )}
              </div>
              {showing === rate.key ? <RateHistory rate={rate} /> : null}
              {offering === rate.key ? (
                <div className={UNDER_THE_ROW}>
                  <div className="flex flex-wrap justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <ConsoleIcon name="bell" size={16} />
                      {t('rates.notice')} <SoonTag />
                    </span>
                    <span className="text-fg-muted">{t('rates.noticeLater')}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      )}
    </ConsolePage>
  );
}
