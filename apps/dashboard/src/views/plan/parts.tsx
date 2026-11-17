import type { ReactNode } from 'react';
import { periodDone } from './figures';

/** One figure of the plan card's three (the prototype's `.stats.tight .stat`). */
export function TightStat({
  label,
  value,
  note,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-3 py-2.5">
      <div className="text-[12px] font-medium text-fg-muted">{label}</div>
      <div className="num mt-1.5 text-[20px] leading-[1.1] font-semibold tracking-[-0.01em]">
        {value}
      </div>
      {note ? <div className="mt-1 text-[13px] text-fg-subtle">{note}</div> : null}
    </div>
  );
}

/** The plan card's figures: three columns at every width, as the sketch draws them. */
export function TightStats({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
}

/** The plan card's frame: teal-50 with a teal-200 hairline (the prototype's current-plan card). */
export function CurrentCard({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="rounded-card border border-brand-200 bg-primary-soft p-4">{children}</div>;
}

/**
 * The shop's own plan (Fixes · UI/UX batch 2, the prototype's `.ux-mine`): teal-50 with a teal-200 hairline, its parts
 * 10 px apart -- what it is, until when, how far through, the next payment and the orders handled, the one action.
 */
export function MineCard({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-card border border-brand-200 bg-primary-soft p-card">
      {children}
    </div>
  );
}

/** One figure on the plan's own card (the prototype's `.ux-mine .kv`), under a teal-200 rule. */
export function MineLine({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3 border-t border-brand-200 py-2 text-[15px]">
      <span className="text-neutral-700">{label}</span>
      <span className="num text-right font-medium">{value}</span>
    </div>
  );
}

/** The period's bar (the prototype's `.bar.ux-bar`): 8 px, the part gone in the brand's colour. */
export function PeriodBar({
  daysLeft,
  months,
}: {
  daysLeft: number;
  months: number;
}): React.JSX.Element {
  return (
    <div
      className="-mt-0.5 mb-0.5 h-2 overflow-hidden rounded-full bg-neutral-100"
      aria-hidden="true"
    >
      <i
        className="block h-full rounded-full bg-primary"
        style={{ width: `${String(periodDone(daysLeft, months))}%` }}
      />
    </div>
  );
}

/** The plan cards, a sideways row on a phone and in the page's padding from 640 px (the prototype's `.hscroll`). */
export function PlanRow({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

interface PlanCardProps {
  name: string;
  /** The term's price, and what it is per ("/month"). */
  price: string;
  per: string;
  lines: string[];
  action: ReactNode;
  /** The shop's own plan. */
  current?: boolean;
  /** Pay-as-you-go's card, with a dashed edge. */
  dashed?: boolean;
}

/** One plan (the prototype's `.plancard`): 260 px, the name, the price, its limits and the one move it allows. */
export function PlanCard({
  name,
  price,
  per,
  lines,
  action,
  current = false,
  dashed = false,
}: PlanCardProps): React.JSX.Element {
  return (
    <div
      className={[
        'flex-[0_0_260px] rounded-card border p-4',
        current ? 'border-primary bg-primary-soft' : 'border-line bg-surface',
        dashed ? 'border-dashed' : '',
      ].join(' ')}
    >
      <div className="text-[17px] font-semibold">{name}</div>
      <div className="num mt-1.5 mb-0.5 text-[28px] font-semibold">
        {price}
        <small className="text-[14px] font-medium text-fg-muted">{per}</small>
      </div>
      <ul className="mt-2.5 mb-3.5 flex flex-col gap-1 text-[14px] text-neutral-700">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {action}
    </div>
  );
}

/** A disclosure at a page's foot (the prototype's `details.card`): one paragraph and the one red button. */
export function Disclosure({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <details className="rounded-card border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">{title}</summary>
      {children}
    </details>
  );
}
