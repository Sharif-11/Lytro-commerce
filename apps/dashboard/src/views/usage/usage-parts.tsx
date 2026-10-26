import { Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { appConfig } from '@/lib/app-config';
import { formatDayMonth } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import type { UsageFigure } from '@/types/usage';
import {
  amountOf,
  barTone,
  METRIC_KEY,
  percentOf,
  type BannerLink,
  type DayBar,
  type RaiseItem,
} from './usage-words';

const BAR_TONES = { bad: 'bg-danger', warn: 'bg-warning' } as const;
const LINK = 'font-semibold text-primary underline';

/** Where a banner leads: the pack sheet, an add-on's sheet, or the top-up sheet. */
export function BannerLinkTo({ link }: { link: BannerLink }): React.JSX.Element {
  const { slug } = useShell();
  const className = 'text-primary';
  if (link.kind === 'topUp') {
    return (
      <Link to="/$shop/balance" params={{ shop: slug }} search={{ topup: 1 }} className={className}>
        {link.label}
      </Link>
    );
  }
  return (
    <Link
      to="/$shop/addons"
      params={{ shop: slug }}
      search={link.kind === 'pack' ? { pack: link.metric } : { buy: link.key }}
      className={className}
    >
      {link.label}
    </Link>
  );
}

function RaiseLink({ item }: { item: RaiseItem }): React.JSX.Element {
  const { slug } = useShell();
  if (item.kind === 'contact') {
    return (
      <a href={appConfig.contactUrl()} className={LINK}>
        {item.text}
      </a>
    );
  }
  if (item.kind === 'plan') {
    return (
      <Link
        to="/$shop/plan"
        params={{ shop: slug }}
        search={{ plan: item.planId }}
        className={LINK}
      >
        {item.text}
      </Link>
    );
  }
  return (
    <Link
      to="/$shop/addons"
      params={{ shop: slug }}
      search={item.kind === 'pack' ? { pack: item.metric } : { buy: item.key }}
      className={LINK}
    >
      {item.text}
    </Link>
  );
}

// The place the ways to room go in the sentence that names them ("To raise it: {{items}}").
const SLOT = '\u0000';

/**
 * One metric's card row (the prototype's `.ucard`): its name, used of its limit and whether it resets each cycle, the
 * bar, the run-out date where the pace uses it up inside the cycle, and from 80% the ways to more room.
 */
export function MetricRow({
  figure,
  raise,
}: {
  figure: UsageFigure;
  raise: RaiseItem[];
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const tone = barTone(figure);
  const [before = '', after = ''] = t('uSuggest', { items: SLOT }).split(SLOT);
  return (
    <div className="flex flex-col gap-1.5 border-line px-4 py-3 [&+&]:border-t">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">{t(METRIC_KEY[figure.metric])}</span>
        <span className="num text-[13px] text-fg-muted">
          {amountOf(figure, figure.used)} /{' '}
          {figure.limit === null ? t('uUnlimited') : amountOf(figure, figure.limit)} ·{' '}
          {figure.perCycle ? t('uPerCycle') : t('uTotal')}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-[4px] bg-neutral-100">
        <i
          className={`block h-full rounded-[4px] ${tone ? BAR_TONES[tone] : 'bg-primary'}`}
          style={{ width: `${String(Math.min(100, percentOf(figure)))}%` }}
        />
      </div>
      {figure.runsOutAt ? (
        <p className="text-[13px] text-fg-muted">
          {t('uRunout', { date: formatDayMonth(figure.runsOutAt) })}
        </p>
      ) : null}
      {raise.length > 0 ? (
        <p className="text-[13px] text-fg-muted">
          {before}
          {raise.map((item, index) => (
            <Fragment key={`${item.kind}-${item.text}`}>
              {index > 0 ? ' · ' : null}
              <RaiseLink item={item} />
            </Fragment>
          ))}
          {after}
        </p>
      ) : null}
    </div>
  );
}

/** A switch row inside a card (the prototype's `switchRow`). */
export function SwitchRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-11 items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1 text-[15px] font-medium">{label}</span>
      <Switch checked={checked} label={label} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/** A note under an auto-buy switch: what auto-buy did this cycle. */
export function SwitchNote({
  bad,
  children,
}: {
  bad: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <p className={`-mt-1 mb-1 text-[14px] ${bad ? 'text-danger' : 'num text-fg-muted'}`}>
      {children}
    </p>
  );
}

/**
 * BND-08: a day chart (the prototype's `.chart`): a bar a day of the cycle, today's in the primary colour, the cycle's
 * first day under its start and today's figure under its end.
 */
export function DayChart({
  title,
  bars,
  first,
  todayFigure,
}: {
  title: string;
  bars: DayBar[];
  first: string;
  todayFigure: string;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const most = Math.max(...bars.map((bar) => bar.value), 0);
  return (
    <Card>
      <h3 className="mb-1 text-[17px] font-semibold">{title}</h3>
      <div className="mt-3 flex h-[72px] items-end gap-[3px]" aria-hidden="true">
        {bars.map((bar, index) => (
          <i
            key={bar.day}
            className={`flex-1 rounded-t-[2px] ${index === bars.length - 1 ? 'bg-primary' : 'bg-brand-300'}`}
            style={{ height: `${String(most > 0 ? Math.round((bar.value / most) * 100) : 0)}%` }}
          />
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[14px] text-fg-muted">
        <span>{first}</span>
        <span>
          {t('uToday')} · {todayFigure}
        </span>
      </div>
    </Card>
  );
}
