import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { PAYG_API_CAP_MAX, PAYG_API_CAP_WARN_PERCENT, TenantState } from '@lytronix/validators';
import { useApiCharges, useSetApiCap, type ApiChargeSummary } from '@/api/api-keys';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { formatDayMonth, formatShortDay, shortMonth } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';

const DAY_MS = 86_400_000;

const number = (value: number): string => value.toLocaleString('en-IN');

/** "10 নভে", "10 Nov": a day of the cycle's range, as the sketch's card head writes it. */
function rangeDay(iso: string, language: string): string {
  if (language !== 'bn') return formatDayMonth(iso);
  const [day] = formatDayMonth(iso).split(' ');
  return `${day ?? ''} ${shortMonth(iso, language)}`;
}

/** The cycle's last day: a month after it began, less a day. */
function cycleEnd(start: string): string {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return new Date(end.getTime() - DAY_MS).toISOString();
}

/** A small note under a card's figures (the sketch's `.pf-note`). */
function Note({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="mt-2.5 flex items-start gap-1.5 text-[13px] text-fg-muted">
      <Icon name="info" size={16} className="mt-0.5 flex-none" />
      <span>{children}</span>
    </p>
  );
}

/** The 80% warning, or the stop, above the figures (the sketch's `pf-api`). */
function ChargeBanner({
  summary,
  onRaise,
}: {
  summary: ApiChargeSummary;
  onRaise: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('menu');
  const cap = Number(summary.cap);
  const charged = Number(summary.charged);
  const raise = (
    <button type="button" className="font-semibold text-primary" onClick={onRaise}>
      {t('apiRaise')}
    </button>
  );
  if (summary.stopped) {
    return (
      <Banner tone="bad" action={raise}>
        <b>{t('apiStoppedT', { cap: formatTaka(cap) })}</b> {t('apiStoppedB')}
      </Banner>
    );
  }
  if (cap > 0 && charged * 100 >= cap * PAYG_API_CAP_WARN_PERCENT) {
    return (
      <Banner tone="warn" action={raise}>
        <b>
          {t('apiNearT', {
            charged: formatTaka(charged),
            cap: formatTaka(cap),
            percent: Math.min(100, Math.floor((charged * 100) / cap)),
          })}
        </b>{' '}
        {t('apiNearB')}
      </Banner>
    );
  }
  return null;
}

/** PF-36 (PFQ-10): the cap, ৳0 to ৳5,000, where ৳0 stops at the free allowance. */
function CapSheet({
  summary,
  onClose,
}: {
  summary: ApiChargeSummary;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const save = useSetApiCap();
  const [value, setValue] = useState(String(Math.round(Number(summary.cap))));
  const digits = value.replace(/[^\d]/g, '');
  const cap = Number(digits);
  const fits = digits !== '' && cap <= PAYG_API_CAP_MAX;
  return (
    <Sheet
      open
      title={t('apiCapTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={save.isPending}
          disabled={!fits}
          onClick={() => {
            save.mutate(cap, { onSuccess: onClose });
          }}
        >
          {t('apiCapSave')}
        </Button>
      }
    >
      {save.isError ? <ErrorBanner error={save.error} /> : null}
      <Field
        label={t('apiCapLabel')}
        prefix="৳"
        inputMode="numeric"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        error={
          digits !== '' && !fits
            ? t('apiCapTooHigh', { max: formatTaka(PAYG_API_CAP_MAX) })
            : undefined
        }
        help={t('apiCapZero', { n: number(summary.free), max: formatTaka(PAYG_API_CAP_MAX) })}
      />
    </Sheet>
  );
}

/**
 * PYG-26 (PAYG-FAIR-USE-PLAN PF-14, PF-36, the sketch's `pf-api`): on pay-as-you-go with fair use on, what the shop's
 * own website's API cost this cycle -- the free 10,000 and the paid requests past them -- the cap and its warning, and
 * the charges day by day. Nothing on a plan or a trial, nor with fair use off.
 */
export function ApiChargesSection(): React.JSX.Element | null {
  const { t, i18n } = useTranslation('menu');
  const { tenant } = useShell();
  const on = tenant.fairUse?.on === true && tenant.state === TenantState.PayAsYouGo;
  const charges = useApiCharges({ enabled: on });
  const [editing, setEditing] = useState(false);
  if (!on) return null;
  if (charges.isError) return <ErrorBanner error={charges.error} />;
  const summary = charges.data;
  if (!summary?.applies) return null;
  const language = i18n.language;
  const paid = Math.max(0, summary.requests - summary.free);
  const freeUsed = Math.min(summary.requests, summary.free);
  const whole = Math.max(summary.requests, summary.free);
  const freeShare = whole === 0 ? 0 : Math.round((freeUsed * 100) / whole);
  const paidShare = paid === 0 ? 0 : 100 - freeShare;
  const cap = Number(summary.cap);
  const charged = Number(summary.charged);
  const spentShare = cap === 0 ? 100 : Math.min(100, Math.round((charged * 100) / cap));
  const days = summary.days.filter((day) => Number(day.charged) > 0).reverse();
  const edit = () => {
    setEditing(true);
  };
  const capBar = summary.stopped
    ? 'bg-danger'
    : spentShare >= PAYG_API_CAP_WARN_PERCENT
      ? 'bg-warning-fill'
      : 'bg-primary';
  return (
    <>
      <ChargeBanner summary={summary} onRaise={edit} />
      <Card>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{t('apiCycleT')}</h2>
          <span className="text-[14px] text-fg-muted">
            {rangeDay(summary.cycleStart, language)} –{' '}
            {rangeDay(cycleEnd(summary.cycleStart), language)}
          </span>
        </div>
        <p className="num text-[30px] leading-[1.15] font-semibold tracking-[-0.01em]">
          {number(summary.requests)}{' '}
          <small className="text-[15px] font-medium text-fg-muted">{t('apiSuccessful')}</small>
        </p>
        <div className="mt-3 mb-2 flex h-3 overflow-hidden rounded-full bg-neutral-100">
          <i className="block h-full bg-success" style={{ width: `${String(freeShare)}%` }} />
          <i className="block h-full bg-primary" style={{ width: `${String(paidShare)}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-[3px] bg-success" />
            {summary.requests >= summary.free
              ? t('apiFreeDone', { n: number(summary.free) })
              : t('apiFreeLeft', {
                  n: number(summary.free),
                  left: number(summary.free - freeUsed),
                })}
          </span>
          {paid > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-primary" />
              {t('apiPaid', { n: number(paid), amount: formatTaka(charged) })}
            </span>
          ) : null}
        </div>
        <div className="mt-3 border-t border-line" />
        <Note>
          {t('apiHow', { n: number(summary.free), rate: formatTaka(Number(summary.rate)) })}
        </Note>
      </Card>
      <Card>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{t('apiCapT')}</h2>
          <Button tone="outline" size="sm" onClick={edit}>
            <Icon name="pencil" />
            {t('apiEdit')}
          </Button>
        </div>
        <p className="flex items-baseline gap-2">
          <b className="num text-[28px] font-semibold">{formatTaka(cap)}</b>
          <span className="text-[14px] text-fg-muted">{t('apiCapNever')}</span>
        </p>
        <div className="mt-3 mb-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
          <i
            className={`block h-full rounded-full ${capBar}`}
            style={{ width: `${String(spentShare)}%` }}
          />
        </div>
        <p className="text-[14px] text-fg-muted">
          {t('apiSpent', {
            charged: formatTaka(charged),
            left: formatTaka(Math.max(0, cap - charged)),
          })}
        </p>
        <Note>
          {t('apiCapZero', { n: number(summary.free), max: formatTaka(PAYG_API_CAP_MAX) })}
        </Note>
      </Card>
      {days.length > 0 ? (
        <Card>
          <h2 className="mb-1 text-[17px] font-semibold">{t('apiDaysT')}</h2>
          <div className="mt-1.5">
            {days.map((day) => (
              <div
                key={day.day}
                className="kv flex justify-between gap-3 py-2 text-[14px] [.kv+&]:border-t [.kv+&]:border-line"
              >
                <span className="text-fg-muted">
                  <b className="font-medium text-fg">{formatShortDay(day.day, language)}</b> ·{' '}
                  {t('apiDayN', { n: number(day.billable) })}
                </span>
                <span className="num text-right font-medium">
                  {formatTaka(Number(day.charged))}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {editing ? (
        <CapSheet
          summary={summary}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}
