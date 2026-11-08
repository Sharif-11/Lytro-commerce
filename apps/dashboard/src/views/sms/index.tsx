import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka, formatTakaExact } from '@lytronix/ui';
import { Permission, SmsLogStatus } from '@lytronix/validators';
import { useBalance } from '@/api/balance';
import { useSaveSmsSettings, useSmsLog, useSmsReport, useSmsSettings } from '@/api/sms';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { chipClass } from '@/components/ui/classes';
import { ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { SectionHead } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { dayKey, formatShortDay, formatTime } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { SmsEventSetting, SmsLogRow, SmsSettings } from '@/types/sms';
import { AlwaysOn } from '@/views/notifications/prefs';
import { CapSheet, NameSheet, SmsSample, TemplateSheet } from './sheets';
import { BLOCKED_WORDS, EVENT_WORDS, LOG_KIND_WORDS } from './sms-words';

type Tab = 'settings' | 'log' | 'report';

/** Settings, Log and Report (Part 37's `p37SmsTabs`). */
function SmsTabs({ tab }: { tab: Tab }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug } = useShell();
  const tabs: [Tab, string][] = [
    ['settings', 'p37TabSettings'],
    ['log', 'p37TabLog'],
    ['report', 'p37TabReport'],
  ];
  return (
    <ChipRow role="navigation">
      {tabs.map(([each, word]) => (
        <Link
          key={each}
          to="/$shop/settings/sms"
          params={{ shop: slug }}
          search={each === 'settings' ? {} : { tab: each }}
          aria-current={tab === each ? 'page' : undefined}
          className={chipClass(tab === each)}
        >
          {t(word)}
        </Link>
      ))}
    </ChipRow>
  );
}

/** An estimate as the row says it (SMS-12): per order before any, else about a month, "if on" when off. */
function useEstimate(): (setting: SmsEventSetting) => string {
  const { t } = useTranslation('menu');
  return (setting) => {
    if (setting.estimate.basis === 'per_order')
      return t('p37EstOrder', { c: formatTakaExact(setting.estimate.cost) });
    const c = formatTakaExact(setting.estimate.cost);
    return setting.on ? t('p37Est30', { c, n: setting.estimate.count }) : t('p37EstOff', { c });
  };
}

/** One SMS's row (Part 37's `p37EvRow`): its name, when it goes, the next SMS as it reads, its parts and estimate. */
function EventRow({
  setting,
  readOnly,
  onOpen,
  onSwitch,
}: {
  setting: SmsEventSetting;
  readOnly: boolean;
  onOpen: () => void;
  onSwitch: (on: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const estimate = useEstimate();
  const [name, when] = EVENT_WORDS[setting.event];
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span className="text-[16px] font-medium">
          {t(name)}{' '}
          {setting.edited ? (
            <StatusTag tone="neutral" small>
              {t('p37Edited')}
            </StatusTag>
          ) : null}
        </span>
        <span className="text-[14px] text-fg-muted">{t(when)}</span>
        <SmsSample>{setting.sample}</SmsSample>
        <span className="num text-[14px] text-fg-muted">
          {t('p37PartsN', { count: setting.units })} · {estimate(setting)}
        </span>
      </button>
      <span className="mt-0.5">
        {readOnly ? (
          <StatusTag tone={setting.on ? 'ok' : 'neutral'}>
            {setting.on ? t('p37On') : t('p37Off')}
          </StatusTag>
        ) : (
          <Switch checked={setting.on} onChange={onSwitch} label={t(name)} />
        )}
      </span>
    </div>
  );
}

/** A group of SMS in its card (Part 37's `.daylbl` heading and the hint under it). */
function Group({
  title,
  hint,
  children,
  foot,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  foot?: string;
}): React.JSX.Element {
  return (
    <Card flush>
      <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
        {title}
      </div>
      <p className="px-4 pt-1.5 pb-1 text-[14px] text-fg-muted">{hint}</p>
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
      {foot ? <p className="px-4 pt-2.5 pb-3.5 text-[14px] text-fg-muted">{foot}</p> : null}
    </Card>
  );
}

const ESSENTIAL_WORDS: Readonly<Record<string, readonly [string, string]>> = {
  shopper_code: ['p37EsShopper', 'p37EsShopperD'],
  staff_reset_code: ['p37EsReset', 'p37EsResetD'],
  shop_ready: ['p37EsReady', 'p37EsReadyD'],
};

type Open =
  { kind: 'template'; setting: SmsEventSetting } | { kind: 'name' } | { kind: 'cap' } | null;

/** The Settings tab (Part 37's `p37-sms`). */
function SettingsTab({ settings }: { settings: SmsSettings }): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const { slug, viewer, showToast } = useShell();
  const errorText = useErrorText();
  const save = useSaveSmsSettings();
  const balance = useBalance({ enabled: allows(viewer, [Permission.BalanceRead]) });
  const readOnly = !allows(viewer, [Permission.SmsManage]);
  const [open, setOpen] = useState<Open>(null);
  // SMS-13: the cycle as the server counts it, the day order SMS start again at its end.
  const cycleEnd = formatShortDay(settings.cycleEnd, i18n.language);
  const cycleStart = formatShortDay(settings.cycleStart, i18n.language);
  const spent = Number(settings.spentThisMonth);
  const cap = settings.monthlySpendCap ? Number(settings.monthlySpendCap) : null;
  const share = cap ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
  const lowBalance = balance.data ? Number(balance.data.amount) < Number(settings.rate) : false;
  const toShopper = settings.events.filter((each) => each.recipient === 'shopper');
  const toOwner = settings.events.filter((each) => each.recipient === 'owner');
  const openCap = (): void => {
    setOpen({ kind: 'cap' });
  };
  const flip = (setting: SmsEventSetting, on: boolean): void => {
    save.mutate(
      { events: { [setting.event]: on } },
      {
        onSuccess: () => {
          showToast(t('p37SmsSaved'));
        },
        onError: (error) => {
          showToast(errorText(error));
        },
      },
    );
  };
  const row = (setting: SmsEventSetting): React.JSX.Element => (
    <EventRow
      key={setting.event}
      setting={setting}
      readOnly={readOnly}
      onOpen={() => {
        setOpen({ kind: 'template', setting });
      }}
      onSwitch={(on) => {
        flip(setting, on);
      }}
    />
  );
  const raise = readOnly ? undefined : (
    <button type="button" className="text-primary" onClick={openCap}>
      {t('p37RaiseCap')}
    </button>
  );
  return (
    <>
      {readOnly ? <Banner tone="neutral">{t('p37SmsRo')}</Banner> : null}
      {cap && share >= 100 ? (
        <Banner tone="bad" action={raise}>
          {t('p37Capped', { c: formatTaka(cap), d: cycleEnd })}
        </Banner>
      ) : cap && share >= 80 ? (
        <Banner tone="warn" action={raise}>
          {t('p37Cap80', { p: share, s: formatTakaExact(spent), c: formatTaka(cap), d: cycleEnd })}
        </Banner>
      ) : null}
      {lowBalance && balance.data ? (
        <Banner
          tone="warn"
          action={
            readOnly ? undefined : (
              <Link to="/$shop/balance" params={{ shop: slug }} className="text-primary">
                {t('p37TopUp')}
              </Link>
            )
          }
        >
          {t('p37LowBal', { b: formatTakaExact(balance.data.amount) })}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start [&>*]:min-w-0">
        <div className="flex flex-col gap-4">
          <Group title={t('p37ToCustomer')} hint={t('p37ToCustomerD')}>
            {toShopper.map(row)}
          </Group>
          <Group
            title={t('p37ToYou')}
            hint={
              settings.ownerPhone ? t('p37ToYouD', { p: settings.ownerPhone }) : t('p37ToYouDNone')
            }
          >
            {toOwner.map(row)}
          </Group>
          <Group title={t('p37Always')} hint={t('p37AlwaysD')} foot={t('p37EsSignin')}>
            {settings.essentials.map((essential) => {
              const [name, line] = ESSENTIAL_WORDS[essential.kind] ?? [essential.kind, ''];
              return (
                <div key={essential.kind} className="flex items-start gap-3 px-4 py-3.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[16px] font-medium">{t(name)}</span>
                    {line ? <span className="text-[14px] text-fg-muted">{t(line)}</span> : null}
                    <SmsSample>{essential.words}</SmsSample>
                  </span>
                  <AlwaysOn />
                </div>
              );
            })}
          </Group>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <SectionHead
              link={
                readOnly ? undefined : (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen({ kind: 'name' });
                    }}
                  >
                    {t('p37Edit')}
                  </button>
                )
              }
            >
              {t('p37SmsName')}
            </SectionHead>
            <div className="mt-1.5 mb-2 flex flex-wrap items-center gap-2 text-[20px] font-semibold">
              {settings.smsName}
              {settings.usesShopName ? (
                <StatusTag tone="neutral">{t('p37SmsNameShop')}</StatusTag>
              ) : null}
            </div>
            <p className="text-[14px] text-fg-muted">{t('p37SmsNameD', { n: settings.smsName })}</p>
          </Card>
          <Card>
            <SectionHead
              link={
                readOnly || !cap ? undefined : (
                  <button type="button" onClick={openCap}>
                    {t('p37EditCap')}
                  </button>
                )
              }
            >
              {t('p37Spend')}
            </SectionHead>
            <div className="num mt-1.5 mb-2 text-[26px] font-semibold tracking-[-0.01em]">
              {formatTakaExact(spent)}{' '}
              {cap ? (
                <small className="text-[14px] font-medium text-fg-muted">
                  {t('p37SpendOf', { c: formatTaka(cap) })}
                </small>
              ) : null}
            </div>
            {cap ? (
              <div className="mb-2.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                <i
                  className={`block h-full rounded-full ${share >= 100 ? 'bg-danger' : share >= 80 ? 'bg-warning' : 'bg-primary'}`}
                  style={{ width: `${String(share)}%` }}
                />
              </div>
            ) : (
              <p className="mb-2 font-semibold">{t('p37NoCap')}</p>
            )}
            <p className="mb-1.5 text-[14px] text-fg-muted">{t('p37SpendD', { a: cycleStart })}</p>
            <p className="text-[14px] text-fg-muted">{t('p37CapRule', { d: cycleEnd })}</p>
            {readOnly || cap ? null : (
              <div className="mt-3">
                <Button tone="outline" size="sm" onClick={openCap}>
                  {t('p37SetCap')}
                </Button>
              </div>
            )}
          </Card>
          <Card>
            <h3 className="text-[16px] font-semibold">{t('p37HowCounted')}</h3>
            <p className="mt-1 mb-2 text-[14px] text-fg-muted">
              {t('p37HowCountedD', { n: settings.unitSize, r: formatTakaExact(settings.rate) })}
            </p>
            {allows(viewer, [Permission.BalanceRead]) ? (
              <Link
                to="/$shop/balance"
                params={{ shop: slug }}
                className="text-[14px] font-semibold text-primary no-underline"
              >
                {t('p37SeeRates')}
              </Link>
            ) : null}
          </Card>
        </div>
      </div>
      {open?.kind === 'template' ? (
        <TemplateSheet
          setting={
            settings.events.find((each) => each.event === open.setting.event) ?? open.setting
          }
          settings={settings}
          readOnly={readOnly}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'name' ? (
        <NameSheet
          settings={settings}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'cap' ? (
        <CapSheet
          settings={settings}
          cycleEnd={cycleEnd}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}

/** One SMS in the log (Part 37's `.p37logrow`): its kind and state, the phone and its order, the words, cost and when. */
export function LogRow({
  row,
  inOrder = false,
}: {
  row: SmsLogRow;
  /** On the order's own page, which needs no way back to itself. */
  inOrder?: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const { slug } = useShell();
  const tone =
    row.status === SmsLogStatus.Sent ? 'ok' : row.status === SmsLogStatus.Failed ? 'bad' : 'warn';
  const state =
    row.status === SmsLogStatus.Sent
      ? 'p37StSent'
      : row.status === SmsLogStatus.Failed
        ? 'p37StFailed'
        : 'p37StBlocked';
  const today = dayKey(row.createdAt) === dayKey(new Date().toISOString());
  const when = today
    ? formatTime(row.createdAt, i18n.language)
    : `${formatShortDay(row.createdAt, i18n.language)}, ${formatTime(row.createdAt, i18n.language)}`;
  const free = row.status === SmsLogStatus.Sent && Number(row.cost) === 0;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">
          {t(LOG_KIND_WORDS[row.kind])} <StatusTag tone={tone}>{t(state)}</StatusTag>
        </span>
        <span className="num text-[13px] text-fg-muted [overflow-wrap:anywhere]">
          {row.toPhone}
          {row.orderId && row.orderNumber && !inOrder ? (
            <>
              {' · '}
              <Link
                to="/$shop/orders/$orderId"
                params={{ shop: slug, orderId: row.orderId }}
                className="whitespace-nowrap text-primary"
              >
                #{row.orderNumber}
              </Link>
            </>
          ) : null}
        </span>
        {row.body ? (
          <SmsSample>{row.body}</SmsSample>
        ) : (
          <span className="text-[13px] text-fg-muted">{t('p37LogCode')}</span>
        )}
        {row.status === SmsLogStatus.Blocked && row.blockedReason ? (
          <span className="text-[13px] font-medium text-warning">
            {t(BLOCKED_WORDS[row.blockedReason])}
          </span>
        ) : null}
        {row.status === SmsLogStatus.Failed ? (
          <span className="text-[13px] font-medium text-danger">{t('p37FailedD')}</span>
        ) : null}
      </span>
      <span className="flex flex-none flex-col items-end gap-1 text-right text-[13px] text-fg-muted">
        <b className="num text-[15px] font-semibold text-fg">
          {row.status === SmsLogStatus.Sent
            ? free
              ? t('p37LogFree')
              : formatTakaExact(row.cost)
            : formatTaka(0)}
        </b>
        <span className="num">{t('p37PartsN', { count: row.units })}</span>
        <span>{when}</span>
      </span>
    </div>
  );
}

/** The Log tab (Part 37's `p37-sms-log`, SMS-07, SMS-17). */
function LogTab(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const log = useSmsLog();
  const rows = log.data?.pages.flatMap((page) => page.sms) ?? [];
  if (log.isLoading) {
    return (
      <Card flush>
        <SkeletonRows count={5} />
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon="sms">{t('p37LogEmpty')}</EmptyState>
      </Card>
    );
  }
  return (
    <>
      <p className="text-[14px] text-fg-muted">{t('p37LogLead')}</p>
      <Card flush>
        <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
          {rows.map((row) => (
            <LogRow key={row.id} row={row} />
          ))}
        </div>
      </Card>
      {log.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={log.isFetchingNextPage}
          onClick={() => {
            void log.fetchNextPage();
          }}
        >
          {t('p37LoadMore')}
        </Button>
      ) : null}
      <p className="text-[14px] text-fg-muted">{t('p37LogSentMeans')}</p>
    </>
  );
}

interface KindTotal {
  kind: SmsLogRow['kind'];
  sent: number;
  failed: number;
  blocked: number;
  units: number;
  cost: number;
}

/** The Report tab (Part 37's `p37-sms-report`, SMS-14): by kind over the days, and each day's cost as bars. */
function ReportTab(): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const errorText = useErrorText();
  const [picking, setPicking] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useSmsReport(range);
  const days = report.data?.days ?? [];
  const totals: KindTotal[] = [];
  for (const day of days) {
    let total = totals.find((each) => each.kind === day.kind);
    if (!total) {
      total = { kind: day.kind, sent: 0, failed: 0, blocked: 0, units: 0, cost: 0 };
      totals.push(total);
    }
    total.sent += day.sent;
    total.failed += day.failed;
    total.blocked += day.blocked;
    total.units += day.units;
    total.cost += Number(day.cost);
  }
  const all = totals.reduce(
    (sum, row) => ({
      sent: sum.sent + row.sent,
      failed: sum.failed + row.failed,
      blocked: sum.blocked + row.blocked,
      units: sum.units + row.units,
      cost: sum.cost + row.cost,
    }),
    { sent: 0, failed: 0, blocked: 0, units: 0, cost: 0 },
  );
  const byDay = new Map<string, number>();
  for (const day of days) byDay.set(day.day, (byDay.get(day.day) ?? 0) + Number(day.cost));
  const dayList: string[] = [];
  if (report.data) {
    const last = Date.parse(report.data.dateTo);
    for (let at = Date.parse(report.data.dateFrom); at <= last; at += 24 * 60 * 60 * 1000)
      dayList.push(new Date(at).toISOString().slice(0, 10));
  }
  const max = Math.max(0.01, ...dayList.map((day) => byDay.get(day) ?? 0));
  const cell = 'px-1.5 py-2.5 text-right tabular-nums';
  return (
    <>
      <ChipRow>
        <button
          type="button"
          className={chipClass(!picking && range === null)}
          onClick={() => {
            setPicking(false);
            setRange(null);
          }}
        >
          {t('p37RepPeriod')}
        </button>
        <button
          type="button"
          className={chipClass(picking || range !== null)}
          onClick={() => {
            setPicking(true);
          }}
        >
          {t('p37RepPick')}
        </button>
      </ChipRow>
      {picking ? (
        <Card className="flex flex-wrap items-end gap-3">
          <Field
            label={t('p37RepFrom')}
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
          <Field
            label={t('p37RepTo')}
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
          <Button
            size="sm"
            disabled={!from || !to}
            onClick={() => {
              setRange({ from, to });
              setPicking(false);
            }}
          >
            {t('p37RepShow')}
          </Button>
        </Card>
      ) : null}
      <p className="text-[14px] text-fg-muted">
        {t('p37RepLead')} {t('p37RepMax')}
      </p>
      {report.isLoading ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : report.isError ? (
        <Banner tone="bad">{errorText(report.error)}</Banner>
      ) : totals.length === 0 ? (
        <Card>
          <EmptyState icon="sms">{t('p37RepEmpty')}</EmptyState>
        </Card>
      ) : (
        <>
          <Card flush className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12px] font-semibold text-neutral-700">
                  <th className="py-2 pr-1.5 pl-4 text-left">{t('p37RepKind')}</th>
                  <th className="px-1.5 py-2 text-right">{t('p37StSent')}</th>
                  <th className="px-1.5 py-2 text-right">{t('p37StFailed')}</th>
                  <th className="px-1.5 py-2 text-right">{t('p37StBlocked')}</th>
                  <th className="px-1.5 py-2 text-right">{t('p37RepParts')}</th>
                  <th className="py-2 pr-4 pl-1.5 text-right">{t('p37RepCost')}</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((row) => (
                  <tr key={row.kind} className="border-b border-line">
                    <td className="py-2.5 pr-1.5 pl-4 text-left font-medium">
                      {t(LOG_KIND_WORDS[row.kind])}
                    </td>
                    <td className={cell}>{row.sent}</td>
                    <td className={cell}>{row.failed}</td>
                    <td className={cell}>{row.blocked}</td>
                    <td className={cell}>{row.units}</td>
                    <td className={`${cell} pr-4`}>{formatTakaExact(row.cost)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2.5 pr-1.5 pl-4 text-left">{t('p37RepTotal')}</td>
                  <td className={cell}>{all.sent}</td>
                  <td className={cell}>{all.failed}</td>
                  <td className={cell}>{all.blocked}</td>
                  <td className={cell}>{all.units}</td>
                  <td className={`${cell} pr-4`}>{formatTakaExact(all.cost)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
          <Card flush>
            <div className="px-4 pt-3.5">
              <h3 className="text-[16px] font-semibold">{t('p37RepDays')}</h3>
            </div>
            <div className="flex h-[72px] items-end gap-[3px] px-4 pt-2">
              {dayList.map((day) => (
                <i
                  key={day}
                  title={`${day} · ${formatTakaExact(byDay.get(day) ?? 0)}`}
                  className="min-h-[2px] flex-1 rounded-t-[3px] bg-brand-300"
                  style={{
                    height: `${String(Math.round(((byDay.get(day) ?? 0) / max) * 100))}%`,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between px-4 pt-1 pb-3 text-[12px] text-neutral-700">
              <span>{report.data ? formatShortDay(report.data.dateFrom, i18n.language) : ''}</span>
              <span>{report.data ? formatShortDay(report.data.dateTo, i18n.language) : ''}</span>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

/**
 * Settings › SMS (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-sms`; SMS-02 to SMS-19): the lead, the tabs, then the
 * ten SMS in three groups beside the SMS name, what this month cost against its cap, and how a part is counted; the log;
 * and the report. sms:read sees it; only sms:manage changes it.
 */
export function SmsView({ tab }: { tab: Tab }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const settings = useSmsSettings({ enabled: tab === 'settings' });
  return (
    <ShellPage>
      {tab === 'settings' ? <p className="text-[14px] text-fg-muted">{t('p37SmsLead')}</p> : null}
      <SmsTabs tab={tab} />
      {tab === 'log' ? (
        <LogTab />
      ) : tab === 'report' ? (
        <ReportTab />
      ) : settings.data ? (
        <SettingsTab settings={settings.data} />
      ) : settings.isError ? (
        <Banner tone="bad">{errorText(settings.error)}</Banner>
      ) : (
        <Card flush>
          <SkeletonRows count={5} />
        </Card>
      )}
    </ShellPage>
  );
}
