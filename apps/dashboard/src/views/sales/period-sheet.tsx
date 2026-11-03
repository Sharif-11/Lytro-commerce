import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { todayInputValue } from '@/lib/dates';
import {
  datesProblem,
  periodOf,
  PERIOD_KEYS,
  type PeriodKey,
  type SalesPeriod,
} from '@/lib/sales-period';

/**
 * The period (TENANT-DASHBOARD-DESIGN §7.34, the prototype's `sh-sales32-period`, `sh-sales32-long`): this month, last
 * month, the last 3 months, this year, or dates picked, at most 5 years. Choosing a named one shows its dates; changing
 * a date makes it picked.
 */
export function PeriodSheet({
  period,
  onDone,
  onClose,
}: {
  period: SalesPeriod;
  onDone: (period: SalesPeriod) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const [draft, setDraft] = useState(period);
  const names: Record<PeriodKey, string> = {
    thisMonth: t('saThisMonth'),
    lastMonth: t('saLastMonth'),
    last3: t('saLast3'),
    thisYear: t('saThisYear'),
    custom: t('saCustom'),
  };
  const problem = draft.from && draft.to ? datesProblem(draft.from, draft.to) : 'order';
  return (
    <Sheet
      open
      title={t('saPeriodT')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={problem !== null}
          onClick={() => {
            onDone(draft);
          }}
        >
          {t('saDone')}
        </Button>
      }
    >
      <RowList role="radiogroup" aria-label={t('saPeriodT')}>
        {PERIOD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={draft.key === key}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
            onClick={() => {
              setDraft(key === 'custom' ? { ...draft, key } : periodOf(key, todayInputValue()));
            }}
          >
            <RadioMark on={draft.key === key} />
            <span className="text-[16px] font-medium">{names[key]}</span>
          </button>
        ))}
      </RowList>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field
          label={t('saDateFrom')}
          type="date"
          value={draft.from}
          onChange={(event) => {
            setDraft({ key: 'custom', from: event.target.value, to: draft.to });
          }}
        />
        <Field
          label={t('saDateTo')}
          type="date"
          value={draft.to}
          error={
            problem === 'long' ? t('saMax') : problem === 'order' ? t('saDatesOrder') : undefined
          }
          onChange={(event) => {
            setDraft({ key: 'custom', from: draft.from, to: event.target.value });
          }}
        />
      </div>
      {problem === null ? <p className="mt-1.5 text-[14px]">{t('saMax')}</p> : null}
    </Sheet>
  );
}
