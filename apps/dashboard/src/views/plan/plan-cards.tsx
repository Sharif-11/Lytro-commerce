import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanCardLine } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import type { PricingTable } from '@/lib/pricing-table';
import type { BillingTerm } from '@/types/billing';
import type { CardLines } from './card-lines';
import { termLabel } from './figures';

/*
 * Fixes · UI/UX batch 2, items 4.3, 5.1 and 5.2 (the prototype's `ux-plan`): the plan screen's cards are the website's --
 * the same lines from one shared builder (@lytronix/validators' PlanCardLines: what every plan shares, the plan's
 * limits, each feature ticked or crossed out), the suggested plan dark with its badge, the shop's own marked "Your
 * plan". Every plan shows at once from a tablet up; a phone swipes, starting at the shop's own plan.
 */

/** The terms over the cards (TRM-12, the prototype's `.ux-terms`): two across on a phone, four from 640 px. */
export function TermPicker({
  terms,
  table,
  termId,
  onPick,
}: {
  terms: readonly BillingTerm[];
  table: PricingTable;
  termId: string | null;
  onPick: (termId: string) => void;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('money');
  if (terms.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t('changePlan')}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {terms.map((term) => {
        const percent = table.discountPercent(term.id);
        const on = term.id === termId;
        return (
          <button
            key={term.id}
            type="button"
            aria-pressed={on}
            className={`flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-[10px] border px-3 py-2 text-left ${
              on ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface'
            }`}
            onClick={() => {
              onPick(term.id);
            }}
          >
            <b className="text-[15px] font-semibold">{termLabel(term, i18n.language)}</b>
            <span className={`text-[14px] ${on ? 'text-on-primary' : 'text-neutral-700'}`}>
              {percent > 0 ? t('ux2.termOff', { p: percent }) : t('ux2.termFull')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The cards (the prototype's `.ux-pgrid`): a swipe on a phone, each 82% wide and snapping, opening at the card marked
 * `data-start`; two across from 640 px and four from 1024 px, nothing to scroll sideways.
 */
export function PlanGrid({ children }: { children: ReactNode }): React.JSX.Element {
  const { t } = useTranslation('money');
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = row.current;
    const start = grid?.querySelector<HTMLElement>('[data-start]');
    if (!grid || !start || grid.scrollWidth <= grid.clientWidth) return;
    grid.scrollLeft = start.offsetLeft - grid.offsetLeft - 16;
  });
  return (
    <>
      <div
        ref={row}
        data-testid="plan-grid"
        className="-mx-4 grid snap-x snap-mandatory auto-cols-[82%] grid-flow-col gap-3 overflow-x-auto px-4 pt-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-x-4 sm:gap-y-[22px] sm:overflow-visible sm:px-0 sm:pt-3.5 lg:grid-cols-4 lg:gap-3.5 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <p className="text-center text-[14px] text-neutral-700 sm:hidden">{t('ux2.swipe')}</p>
    </>
  );
}

function LineList({
  lines,
  hot,
  more = false,
}: {
  lines: PlanCardLine[];
  hot: boolean;
  more?: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation('money');
  if (lines.length === 0) return null;
  return (
    <ul
      className={
        more
          ? `grid gap-1.5 border-t border-dashed pt-3 text-[15px] leading-[1.45] lg:text-[14px] ${hot ? 'border-white/28 text-brand-100' : 'border-line-strong text-neutral-700'}`
          : 'grid gap-2 text-[15px] leading-[1.45] lg:text-[14px]'
      }
    >
      {lines.map((line) => (
        <li
          key={line.text}
          className={`flex items-start gap-2 ${line.on ? '' : hot ? 'text-brand-100' : 'text-neutral-700'}`}
        >
          <Icon
            name={line.on ? 'check' : 'x'}
            size={18}
            className={`mt-0.5 flex-none ${hot ? 'text-brand-300' : line.on ? 'text-brand-700' : 'text-neutral-500'}`}
          />
          {line.on ? (
            <span>{line.text}</span>
          ) : (
            <span
              className={`line-through ${hot ? 'decoration-brand-300' : 'decoration-neutral-400'}`}
            >
              <span className="sr-only">{t('ux2.notIncluded')} </span>
              {line.text}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "You are on this plan", in place of a button on the shop's own card (the prototype's `.ux-here`). */
export function OnThisPlan({ hot = false }: { hot?: boolean }): React.JSX.Element {
  const { t } = useTranslation('money');
  return (
    <div
      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] text-[15px] font-semibold ${
        hot ? 'bg-white/14 text-white' : 'bg-primary-soft text-brand-900'
      }`}
    >
      <Icon name="check" size={16} />
      {t('ux2.here')}
    </div>
  );
}

interface PlanOfferProps {
  name: string;
  /** Who the plan is for, as the operator wrote it. */
  who: string | null;
  /** The price a month, and under it what a longer term comes to. */
  price: string;
  termNote?: string | null;
  card: CardLines;
  /** The shop's own plan: marked, and its badge says so. */
  mine?: boolean;
  /** The operator's suggested plan: dark, with its badge (PLN-21). */
  hot?: boolean;
  /** The card a phone's swipe opens at. */
  start?: boolean;
  action: ReactNode;
}

/** One plan's card (the prototype's `.ux-plan`, the website's `.plan.card`). */
export function PlanOffer({
  name,
  who,
  price,
  termNote = null,
  card,
  mine = false,
  hot = false,
  start = false,
  action,
}: PlanOfferProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const soft = hot ? 'text-brand-100' : 'text-neutral-700';
  return (
    <article
      aria-label={name}
      data-start={start || undefined}
      data-mine={mine || undefined}
      data-hot={hot || undefined}
      className={[
        'relative flex snap-center flex-col gap-3 rounded-card border px-4 pt-[22px] pb-4 lg:px-3.5 lg:pt-6',
        hot ? 'border-brand-900 bg-brand-900 text-white' : 'border-line bg-surface',
        mine ? 'border-primary shadow-[0_0_0_1px_var(--color-primary)]' : '',
      ].join(' ')}
    >
      {mine || hot ? (
        <span
          className={`absolute -top-[13px] left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[14px] leading-[1.3] font-bold whitespace-nowrap ${
            mine
              ? hot
                ? 'bg-white text-brand-900'
                : 'bg-primary text-white'
              : 'bg-accent text-ink'
          }`}
        >
          {mine ? t('ux2.badgeYours') : t('ux2.badgeSug')}
        </span>
      ) : null}
      <h3 className="text-[20px] font-bold">{name}</h3>
      {who ? <p className={`text-[15px] leading-[1.45] lg:text-[14px] ${soft}`}>{who}</p> : null}
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <b className="num text-[32px] leading-none font-bold">{price}</b>
        <span className={`text-[15px] ${soft}`}>{t('ux2.perMo')}</span>
        {termNote ? (
          <small className={`num w-full pt-1 text-[14px] ${soft}`}>{termNote}</small>
        ) : null}
      </p>
      <LineList lines={card.lines} hot={hot} />
      <LineList lines={card.more} hot={hot} more />
      <div className="mt-auto flex flex-col">{action}</div>
    </article>
  );
}
