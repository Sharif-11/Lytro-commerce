import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ScheduledPlanChangeKind } from '@lytronix/validators';
import { useDowngradePreview } from '@/api/billing';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { StatusTag } from '@/components/ui/status-tag';
import { formatDayMonth } from '@/lib/dates';
import { sentenceCase } from '@/lib/limits';
import { useShell } from '@/shell/shell-context';
import type { DowngradeChecklist, ScheduledPlanChange } from '@/types/billing';
import { overLimits } from './figures';

/** A banner's way out, as the sketch writes it: the action's words in the link colour. */
function BannerLink({
  children,
  busy,
  onClick,
}: {
  children: string;
  busy: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={onClick}
      className="font-semibold text-primary disabled:opacity-50"
    >
      {children}
    </button>
  );
}

interface ScheduledBannerProps {
  change: ScheduledPlanChange;
  /** The plan the shop is on, and the one it moves to (null for pay-as-you-go). */
  from: string;
  to: string | null;
  /** The plan whose limits the move is measured against: the target, or pay-as-you-go's. */
  measureAgainst: string | null;
  canManage: boolean;
  busy: boolean;
  onKeep: () => void;
}

/**
 * A move down or to pay-as-you-go waiting for the period's end (DWN-02, PYG-10, the prototype's
 * `plan-downgrade-scheduled`): what moves when, what will be over the limit, and Keep the plan.
 */
export function ScheduledBanner({
  change,
  from,
  to,
  measureAgainst,
  canManage,
  busy,
  onKeep,
}: ScheduledBannerProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const preview = useDowngradePreview(measureAgainst);
  const over = overLimits(preview.data ?? []);
  const date = formatDayMonth(change.effectiveAt);
  const text =
    change.kind === ScheduledPlanChangeKind.PayAsYouGoSwitch || to === null
      ? t('dsPayg', { from, date })
      : over.length > 0
        ? t('dsBanner', { from, to, date, count: over.length })
        : t('dsBannerClean', { from, to, date });
  const list = sentenceCase(
    over
      .map((item) =>
        t('limitUse', {
          limit: t(`lim.${item.key}`, { defaultValue: item.key }),
          used: item.usedText,
          of: item.limitText,
        }),
      )
      .join(' · '),
  );
  return (
    <Banner
      tone="warn"
      action={
        canManage ? (
          <BannerLink busy={busy} onClick={onKeep}>
            {t('dsKeep', { plan: from })}
          </BannerLink>
        ) : undefined
      }
    >
      {text}
      {list ? (
        <>
          <br />
          <span className="num">{list}</span>
        </>
      ) : null}
    </Banner>
  );
}

/** A subscription stopping at the period's end (LIF-01, the prototype's `plan-cancelled`), with Undo. */
export function CancelledBanner({
  periodEnd,
  canManage,
  busy,
  onUndo,
}: {
  periodEnd: string;
  canManage: boolean;
  busy: boolean;
  onUndo: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  return (
    <Banner
      tone="warn"
      action={
        canManage ? (
          <BannerLink busy={busy} onClick={onUndo}>
            {t('cnUndoBtn')}
          </BannerLink>
        ) : undefined
      }
    >
      {t('cnBanner', { date: formatDayMonth(periodEnd) })}
    </Banner>
  );
}

/**
 * The 30 days after a move down (DWN-12, DWN-14, the prototype's `downgrade-checklist`): each limit it left the shop over,
 * with its fix and the list that fixes it, ticked off as it is, and the final warning's date.
 */
export function DowngradeChecklistCard({
  checklist,
  planName,
}: {
  checklist: DowngradeChecklist;
  planName: string;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const { slug } = useShell();
  const items = overLimits(checklist.items).map((item) => ({
    ...item,
    fixed: checklist.items.find((each) => each.key === item.key)?.fixed ?? false,
  }));
  const finalDate = checklist.finalWarningAt ?? checklist.endsAt;
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-[#f1d996] bg-warning-soft p-4">
      <h3 className="text-[17px] font-semibold">{t('dcTitle', { plan: planName })}</h3>
      <p className="text-[14px] text-[#6a4203]">
        {t('dcLead', {
          plan: planName,
          date: formatDayMonth(checklist.downgradedAt),
          end: formatDayMonth(checklist.endsAt),
        })}
      </p>
      <div className="flex flex-col overflow-hidden rounded-[8px] border border-line bg-white [&>*+*]:border-t [&>*+*]:border-line">
        {items.map((item) => {
          const label = sentenceCase(
            t('limitUse', {
              limit: t(`lim.${item.key}`, { defaultValue: item.key }),
              used: item.usedText,
              of: item.limitText,
            }),
          );
          const over = Math.max(0, item.used - item.limit);
          const fix = item.fixed
            ? t('dcFine')
            : item.key === 'products'
              ? t('dcFixProducts', { count: over })
              : item.key === 'staff'
                ? t('dcFixStaff', { count: over })
                : t('dcFixStorage');
          return (
            <Link
              key={item.key}
              to={item.key === 'staff' ? '/$shop/team' : '/$shop/products'}
              params={{ shop: slug }}
              className="flex min-h-12 items-center gap-3 px-3 py-2 text-inherit no-underline"
            >
              <span
                className={[
                  'flex size-8 flex-none items-center justify-center rounded-button',
                  item.fixed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
                ].join(' ')}
              >
                <Icon name={item.fixed ? 'check' : 'alert'} />
              </span>
              <span className="num min-w-0 flex-1 truncate text-[14px] font-medium">
                {t('dcItem', { item: label, fix })}
              </span>
              <StatusTag tone={item.fixed ? 'ok' : 'warn'}>
                {item.fixed ? t('dcDone') : t('dcOpen')}
              </StatusTag>
            </Link>
          );
        })}
      </div>
      <p className="num text-[14px] text-[#6a4203]">
        {t('dcFinal', { date: formatDayMonth(finalDate) })}
      </p>
    </div>
  );
}
