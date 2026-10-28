import type { ReactNode } from 'react';

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** The line under the figure; `good` and `bad` colour it. */
  note?: ReactNode;
  noteTone?: 'plain' | 'good' | 'bad';
  /** In a tight row of three (the prototype's `.stats.tight`): smaller, as a stock check's figures are. */
  tight?: boolean;
}

const NOTE_TONE = { plain: 'text-fg-subtle', good: 'text-success', bad: 'text-danger' } as const;

/** One figure in a "Right now" row (the prototype's `.stat`): 150 px wide on a phone, a grid cell from 640 px. */
export function StatTile({
  label,
  value,
  note,
  noteTone = 'plain',
  tight = false,
}: StatTileProps): React.JSX.Element {
  return (
    <div
      className={`rounded-card border border-line bg-surface ${tight ? 'min-w-0 px-3 py-2.5' : 'flex-[0_0_150px] px-4 py-3.5 sm:flex-auto'}`}
    >
      <div className={`${tight ? 'text-[12px]' : 'text-[13px]'} font-medium text-fg-muted`}>
        {label}
      </div>
      <div
        className={`num mt-1.5 ${tight ? 'text-[20px]' : 'text-[28px]'} leading-[1.1] font-semibold tracking-[-0.01em]`}
      >
        {value}
      </div>
      {note ? <div className={`mt-1 text-[13px] ${NOTE_TONE[noteTone]}`}>{note}</div> : null}
    </div>
  );
}

/**
 * A row of figures: a sideways scroll on a phone, a grid of 150 px columns from 640 px. It takes the keyboard's focus,
 * so the figures past a phone's edge can be scrolled to without a pointer (WCAG 2.1.1).
 */
export function StatRow({
  label,
  tight = false,
  children,
}: {
  label: string;
  /** Three to a row at every width, nothing to scroll (the prototype's `.stats.tight`). */
  tight?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  if (tight) {
    return (
      <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
        {children}
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
