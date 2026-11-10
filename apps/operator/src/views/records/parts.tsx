import { Link } from '@tanstack/react-router';
import type { CSSProperties, ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react';
import { chipClass } from '@/components/ui/chip-class';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { FigureBody } from '@/components/ui/figures';
import { figureBox } from '@/components/ui/figure-box';
import type { ConsolePath } from '@/components/layout/nav-items';

// The pieces OPERATOR-CONSOLE-DESIGN v7's Records pages share (§10e Reports, §10f Audit log, §10g Media costs): the
// figures, the meter, the filters and the label-and-value lists the sketch draws as p88-stats, p88-meter, p88-filters and
// p88-kvs.

/** The strip of figures: two across on a phone, three from 640 px, and four from 1024 px when there are four. */
export function RecordFigures({
  four = false,
  children,
}: {
  four?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${four ? 'lg:grid-cols-4' : ''}`}>
      {children}
    </div>
  );
}

/** One figure; marigold when it needs a person, and a link when it opens a screen. */
export function RecordFigure({
  label,
  value,
  detail,
  flagged = false,
  to,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  flagged?: boolean;
  to?: ConsolePath;
}): React.JSX.Element {
  const body = <FigureBody label={label} value={value} detail={detail} flagged={flagged} />;
  if (to) {
    return (
      <Link to={to} className={`${figureBox(flagged)} hover:border-line-strong`}>
        {body}
      </Link>
    );
  }
  return <div className={figureBox(flagged)}>{body}</div>;
}

/** How much of a limit is used, with a mark where an alert goes: teal, marigold from 80%, red from 95%. */
export function Meter({
  used,
  limit,
  mark,
}: {
  used: number;
  limit: number;
  mark?: number;
}): React.JSX.Element {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const fill = percent >= 95 ? 'bg-danger' : percent >= 80 ? 'bg-accent-500' : 'bg-primary';
  return (
    <div className="relative h-2 rounded-full bg-neutral-100">
      <i
        className={`absolute inset-y-0 left-0 max-w-full rounded-full ${fill}`}
        style={{ width: `${String(percent)}%` }}
      />
      {mark === undefined ? null : (
        <b
          className="absolute -top-1 -bottom-1 w-0.5 rounded-[1px] bg-ink"
          style={{ left: `${String(mark)}%` }}
        />
      )}
    </div>
  );
}

/** The filters' grid: two across on a phone, as many as fit from 640 px. */
export function Filters({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {children}
    </div>
  );
}

/** One filter with its small label; a wide one takes the whole row on a phone. */
export function Pick({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'col-span-full sm:col-auto' : ''}`}>
      <span className="text-[12px] font-semibold text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

const FIELD =
  'h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-[14px] text-ink focus:border-line-active focus:ring-2 focus:ring-field-ring focus:outline-none';

// The sketch's select: its own chevron, 12 px from the right.
const CHEVRON: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232c3f3e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
};

export function PickSelect(props: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select {...props} className={`${FIELD} appearance-none pr-9`} style={CHEVRON} />;
}

export function PickInput(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={`${FIELD} mono`} />;
}

/** Labels beside right-aligned figures, as a card's breakdown. */
export function Kvs({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[14px]">
      {children}
    </div>
  );
}

export function KvsRow({
  label,
  value,
  total = false,
}: {
  label: ReactNode;
  value: ReactNode;
  total?: boolean;
}): React.JSX.Element {
  const line = total ? 'border-t border-line pt-1.5 font-bold' : '';
  return (
    <>
      <span className={`min-w-0 text-neutral-700 ${line}`}>{label}</span>
      <span className={`text-right font-medium tabular-nums ${line}`}>{value}</span>
    </>
  );
}

/** A heading inside a breakdown. */
export function KvsHead({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="col-span-full mt-2 text-[12px] font-bold tracking-[0.04em] text-neutral-700 uppercase bn:text-[13px] bn:tracking-normal bn:normal-case">
      {children}
    </span>
  );
}

/** A card's heading, the page's second level, with what sits at its right: a total or a link. */
export function CardHead({
  title,
  aside,
}: {
  title: ReactNode;
  aside?: ReactNode;
}): React.JSX.Element {
  // Alone, its margin meets the next block's, as the sketch's plain card heading does.
  if (aside === undefined) return <h2 className="mb-1 text-[16px] font-semibold">{title}</h2>;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="mb-1 text-[16px] font-semibold">{title}</h2>
      {aside}
    </div>
  );
}

/** A dollar or taka total at a card's head. */
export function CardMoney({ children }: { children: ReactNode }): React.JSX.Element {
  return <span className="font-display font-bold tracking-[-0.01em] tabular-nums">{children}</span>;
}

/** A big count beside a card's heading. */
export function BigCount({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="font-display text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] tabular-nums">
      {children}
    </span>
  );
}

/** A removable filter, shown as a dark chip with its ×. */
export function FilterChip({
  children,
  onRemove,
  label,
}: {
  children: ReactNode;
  onRemove: () => void;
  label: string;
}): React.JSX.Element {
  return (
    <button type="button" aria-label={label} onClick={onRemove} className={chipClass(true)}>
      {children}
      <ConsoleIcon name="x" />
    </button>
  );
}
