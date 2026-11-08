import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { formatTakaExact } from '@lytronix/ui';
import { FraudSource, FraudSourceState, Permission, TenantState } from '@lytronix/validators';
import { useLatestFraudCheck, useOrderFraudCheck, useRunFraudCheck } from '@/api/fraud';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { StatusTag } from '@/components/ui/status-tag';
import { dayKey, formatShortDay, formatTime } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { FraudCheckView } from '@/types/fraud';

const BANDS: Readonly<Record<string, string>> = {
  none: 'p37BandNone',
  low: 'p37BandLow',
  medium: 'p37BandMedium',
  high: 'p37BandHigh',
};

/** A fresh idempotency key for one check (API-11). */
function newKey(): string {
  return crypto.randomUUID();
}

/** "today 11:42 am", "2 days ago": when a check was made. */
function useCheckedWhen(): (iso: string) => string {
  const { t, i18n } = useTranslation('orders');
  const { t: shell } = useTranslation('shell');
  return (iso) => {
    const minutes = (Date.now() - Date.parse(iso)) / 60_000;
    if (minutes < 2) return t('p37FrJust');
    if (dayKey(iso) === dayKey(new Date().toISOString())) {
      return t('p37FrToday', { t: formatTime(iso, i18n.language) });
    }
    const days = Math.max(
      1,
      Math.round(
        (Date.parse(dayKey(new Date().toISOString())) - Date.parse(dayKey(iso))) / 86_400_000,
      ),
    );
    return shell('p37DaysAgo', { count: days });
  };
}

/** The frame every check's block shares (Part 37's `.fr37`): its heading and when, then its parts. */
function Frame({
  when,
  children,
  flush = false,
}: {
  when?: string;
  children: React.ReactNode;
  flush?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  return (
    <div className={`flex flex-col gap-2.5 ${flush ? '' : 'border-t border-line pt-2.5'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <b className="text-[15px]">{t('p37Fraud')}</b>
        {when ? <span className="text-[13px] text-neutral-700">{when}</span> : null}
      </div>
      {children}
    </div>
  );
}

const meta = 'text-[13px] leading-[1.5] text-neutral-700';
const sub = 'text-[13px] font-semibold text-neutral-700';

/**
 * A check's figures (Part 37's `p37Fraud`, D7-48): Steadfast's delivered, returned and cancelled as three figures and a bar,
 * its record's size, merchants' reports, its doubtful mark and own words; then the shop's own orders; figures only, never a
 * verdict.
 */
export function FraudFigures({
  check,
  auto = false,
  top,
  foot,
  flush = false,
}: {
  check: FraudCheckView;
  auto?: boolean;
  top?: React.ReactNode;
  foot?: React.ReactNode;
  flush?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { i18n } = useTranslation();
  const { slug, viewer } = useShell();
  const when = useCheckedWhen();
  const cost = Number(check.cost) === 0 ? t('p37FrFree') : formatTakaExact(check.cost);
  const steadfast = check.sources.find((each) => each.source === FraudSource.Steadfast);
  const figures = check.steadfast;
  let sf: React.JSX.Element;
  if (steadfast?.state === FraudSourceState.NotConnected) {
    sf = (
      <div className={meta}>
        {t('p37FrNotConnected')}{' '}
        {allows(viewer, [Permission.CouriersManage]) ? (
          <Link
            to="/$shop/settings/couriers"
            params={{ shop: slug }}
            className="font-semibold text-primary"
          >
            {t('p37FrConnect')}
          </Link>
        ) : null}
      </div>
    );
  } else if (steadfast?.state === FraudSourceState.Failed || !figures) {
    sf = (
      <div className={meta}>
        {steadfast?.state === FraudSourceState.Failed ? t('p37FrFailed') : t('p37FrNoHistory')}
      </div>
    );
  } else if (figures.deliveredPercent === null && figures.returnedPercent === null) {
    sf = <div className={meta}>{t('p37FrNoHistory')}</div>;
  } else {
    const d = figures.deliveredPercent ?? 0;
    const r = figures.returnedPercent ?? 0;
    const c = figures.cancelledPercent ?? 0;
    const band = figures.volumeBand ? t(BANDS[figures.volumeBand] ?? figures.volumeBand) : null;
    sf = (
      <>
        <div className="num grid grid-cols-3 gap-2">
          {[
            [d, 'p37FrDelivered'],
            [r, 'p37FrReturned'],
            [c, 'p37FrCancelled'],
          ].map(([value, word]) => (
            <div
              key={String(word)}
              className="min-w-0 rounded-[8px] border border-line bg-neutral-50 px-2.5 py-2"
            >
              <b className="block text-[20px] leading-[1.2] font-semibold tabular-nums">{value}%</b>
              <span className="text-[13px] text-neutral-700">{t(String(word))}</span>
            </div>
          ))}
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-neutral-100">
          <i className="block h-full bg-brand-600" style={{ width: `${String(d)}%` }} />
          <i className="block h-full bg-accent-300" style={{ width: `${String(r)}%` }} />
          <i className="block h-full bg-neutral-400" style={{ width: `${String(c)}%` }} />
        </div>
        <div className={meta}>
          {band
            ? `${t('p37FrBand', { b: figures.volumeRange ? `${band} · ${figures.volumeRange}` : band })} · `
            : ''}
          {figures.reports ? t('p37FrReports', { count: figures.reports }) : t('p37FrNoReports')}
          {figures.doubtful ? (
            <>
              {' · '}
              <b className="text-warning">{t('p37FrDoubtful')}</b>
            </>
          ) : null}
        </div>
        {figures.categories.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {figures.categories.map((category) => (
                <span key={category} lang="en">
                  <StatusTag tone="neutral">{category}</StatusTag>
                </span>
              ))}
            </div>
            <div className={`${meta} -mt-1.5`}>{t('p37FrCatsD')}</div>
          </>
        ) : null}
        {steadfast?.cached ? (
          <div className={meta}>
            {t('p37FrCached', { d: formatShortDay(check.checkedAt, i18n.language) })}
          </div>
        ) : null}
      </>
    );
  }
  const own = check.ownOrders;
  return (
    <Frame
      flush={flush}
      when={auto ? t('p37FrAuto') : t('p37FrChecked', { t: when(check.checkedAt), c: cost })}
    >
      {top}
      <div className={sub}>{t('p37FrSf')}</div>
      {sf}
      <div className={sub}>{t('p37FrOwn')}</div>
      {own.delivered + own.returned + own.cancelled > 0 ? (
        <>
          <div className="num text-[15px]">
            {t('p37FrOwnN', { d: own.delivered, r: own.returned, c: own.cancelled })}
          </div>
          <div className={meta}>{t('p37FrOwnD')}</div>
        </>
      ) : (
        <div className={meta}>{t('p37FrOwnNone')}</div>
      )}
      {auto && foot !== undefined ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={meta}>{t('p37FrChecked', { t: when(check.checkedAt), c: cost })}</span>
          {foot}
        </div>
      ) : foot ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{foot}</div>
      ) : null}
      <div className="text-[12px] leading-[1.5] text-neutral-700">{t('p37FrLead')}</div>
    </Frame>
  );
}

/** A link-like button at a check's foot (Part 37's `.foot .lnk`). */
function FootButton({
  icon,
  children,
  onClick,
  busy,
}: {
  icon: 'refresh' | 'shield';
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary disabled:opacity-50"
    >
      <Icon name={icon} size={16} /> {children}
    </button>
  );
}

/** Running a check, and what the server said when it refused one. */
function useCheck(phone: string): {
  run: () => void;
  busy: boolean;
  refused: { text: string; minute: boolean } | null;
  fresh: FraudCheckView | null;
} {
  const { t } = useTranslation('orders');
  const { showToast } = useShell();
  const check = useRunFraudCheck();
  const [refused, setRefused] = useState<{ text: string; minute: boolean } | null>(null);
  const [fresh, setFresh] = useState<FraudCheckView | null>(null);
  return {
    busy: check.isPending,
    refused,
    fresh,
    run: () => {
      setRefused(null);
      check.mutate(
        { phone, key: newKey() },
        {
          onSuccess: (done) => {
            setFresh(done);
            showToast(t('p37FrAgainDone'));
          },
          onError: (error) => {
            const minute = error instanceof ApiClientError && error.code === 'rate_limited';
            setRefused({ text: minute ? t('p37FrMinute') : errorMessage(error, t), minute });
          },
        },
      );
    },
  };
}

/** The trial's note while checks are free (Part 37's `p37-new-fraud-trial`). */
function TrialNote(): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { tenant } = useShell();
  if (tenant.state !== TenantState.Trial) return null;
  return <div className={meta}>{t('p37FrTrialFree')}</div>;
}

/**
 * On New order, once the phone is valid (Part 37's `p37-new-fraud-*`, D7-63): the number's latest check, asking no one;
 * with none, "Check this number", so typing never costs anything. Refusals in the server's words.
 */
export function NewOrderFraud({ phone }: { phone: string }): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { viewer } = useShell();
  const may = allows(viewer, [Permission.FraudRead]);
  const latest = useLatestFraudCheck(phone, { enabled: may });
  const check = useCheck(phone);
  if (!may) return null;
  const shown = check.fresh ?? latest.data ?? null;
  const refusal = check.refused ? <Banner tone="warn">{check.refused.text}</Banner> : null;
  if (!shown) {
    return (
      <Frame>
        {refusal}
        <div>
          <Button
            tone="outline"
            size="sm"
            busy={check.busy || latest.isLoading}
            onClick={check.run}
          >
            <Icon name="shield" size={18} /> {t('p37FrCheck')}
          </Button>
        </div>
        <div className={meta}>{t('p37FrCheckD', { c: t('p37FrFree') })}</div>
      </Frame>
    );
  }
  return (
    <FraudFigures
      check={shown}
      top={
        <>
          <TrialNote />
          {refusal}
        </>
      }
      foot={
        <FootButton icon="refresh" busy={check.busy} onClick={check.run}>
          {t('p37FrAgain')}
        </FootButton>
      }
    />
  );
}

/**
 * On the order (Part 37's `p37-order-fraud-*`, FRD-05): the automatic check as it stands -- being checked, its figures with
 * Check again for fraud:read, or why it didn't run. Staff who see the order but can't check get no button; a lapsed shop
 * says checks wait for a renewal.
 */
export function OrderFraud({
  orderId,
  phone,
}: {
  orderId: string;
  phone: string;
}): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { viewer, tenant } = useShell();
  const result = useOrderFraudCheck(orderId);
  const check = useCheck(phone);
  const may = allows(viewer, [Permission.FraudRead]);
  const lapsed = tenant.state === TenantState.ReadOnly;
  const found = result.data;
  if (!found || found.state === 'not_applicable') return null;
  const again = lapsed ? (
    <div className={meta}>{t('p37FrFrozen')}</div>
  ) : may ? (
    <FootButton icon="refresh" busy={check.busy} onClick={check.run}>
      {t('p37FrAgain')}
    </FootButton>
  ) : (
    <div className={meta}>{t('p37FrNoPerm')}</div>
  );
  const refusal = check.refused ? <Banner tone="warn">{check.refused.text}</Banner> : null;
  if (check.fresh) return <FraudFigures check={check.fresh} top={refusal} foot={again} />;
  if (found.state === 'pending') {
    return (
      <Frame when={t('p37FrAuto')}>
        <div className={`${meta} flex items-center gap-2`}>
          <Icon name="clock" size={16} /> {t('p37FrPending')}
        </div>
      </Frame>
    );
  }
  if (found.state === 'done' && found.check) {
    return <FraudFigures check={found.check} auto top={refusal} foot={again} />;
  }
  const why =
    found.reason === 'below_minimum'
      ? t('p37FrSkipped', { a: found.minAmount ? formatTakaExact(found.minAmount) : '' })
      : found.reason === 'rule_off'
        ? t('p37FrRuleOff')
        : found.reason === 'refused' && found.message
          ? found.message
          : found.reason === 'minute_limit'
            ? t('p37FrMinute')
            : t('p37FrNotRun');
  return (
    <Frame>
      {refusal}
      <div className={meta}>{why}</div>
      {may && !lapsed ? (
        <div className="flex justify-end">
          <FootButton icon="shield" busy={check.busy} onClick={check.run}>
            {t('p37FrCheck')}
          </FootButton>
        </div>
      ) : lapsed ? (
        <div className={meta}>{t('p37FrFrozen')}</div>
      ) : null}
    </Frame>
  );
}

/** On the customer's page (Part 37's `p37-cust-fraud`): their number's latest check, or none yet with Check this number. */
export function CustomerFraud({ phone }: { phone: string }): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { viewer } = useShell();
  const may = allows(viewer, [Permission.FraudRead]);
  const latest = useLatestFraudCheck(phone, { enabled: may });
  const check = useCheck(phone);
  if (!may || latest.isLoading) return null;
  const shown = check.fresh ?? latest.data ?? null;
  const refusal = check.refused ? <Banner tone="warn">{check.refused.text}</Banner> : null;
  if (!shown) {
    return (
      <Frame flush>
        {refusal}
        <div className={meta}>{t('p37FrNotYet')}</div>
        <div className="flex justify-end">
          <FootButton icon="shield" busy={check.busy} onClick={check.run}>
            {t('p37FrCheck')}
          </FootButton>
        </div>
      </Frame>
    );
  }
  return (
    <FraudFigures
      flush
      check={shown}
      top={refusal}
      foot={
        <FootButton icon="refresh" busy={check.busy} onClick={check.run}>
          {t('p37FrAgain')}
        </FootButton>
      }
    />
  );
}
