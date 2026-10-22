import type { ReactNode } from 'react';

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** The line under the figure; `good` and `bad` colour it. */
  note?: ReactNode;
  noteTone?: 'plain' | 'good' | 'bad';
}

const NOTE_TONE = { plain: 'text-fg-subtle', good: 'text-success', bad: 'text-danger' } as const;

/** One figure in a "Right now" row (the prototype's `.stat`): 150 px wide on a phone, a grid cell from 640 px. */
export function StatTile({
  label,
  value,
  note,
  noteTone = 'plain',
}: StatTileProps): React.JSX.Element {
  return (
    <div className="flex-[0_0_150px] rounded-card border border-line bg-surface px-4 py-3.5 sm:flex-auto">
      <div className="text-[13px] font-medium text-fg-muted">{label}</div>
      <div className="num mt-1.5 text-[28px] leading-[1.1] font-semibold tracking-[-0.01em]">
        {value}
      </div>
      {note ? <div className={`mt-1 text-[13px] ${NOTE_TONE[noteTone]}`}>{note}</div> : null}
    </div>
  );
}

/** A row of figures: a sideways scroll on a phone, a grid of 150 px columns from 640 px. */
export function StatRow({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] sm:px-0 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
