import type { ReactNode } from 'react';
import { chipClass } from './chip-class';

/** A row of filters that runs off the edge on a phone rather than wrapping. */
export function Chips({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {children}
    </div>
  );
}

export function ChipCount({ on, count }: { on: boolean; count: number }): React.JSX.Element {
  return (
    <span
      className={`inline-flex h-[18px] items-center rounded-full px-1.5 text-[12px] font-semibold ${
        on ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-700'
      }`}
    >
      {count}
    </span>
  );
}

/** One filter; its count, when it has one, says how many it holds. */
export function Chip({
  on = false,
  count,
  onClick,
  className = '',
  children,
}: {
  on?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!onClick}
      onClick={onClick}
      className={`${chipClass(on)} disabled:cursor-default disabled:opacity-50 ${className}`}
    >
      {children}
      {count === undefined ? null : <ChipCount on={on} count={count} />}
    </button>
  );
}
