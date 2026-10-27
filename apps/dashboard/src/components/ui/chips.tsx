import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { chipClass, type ChipSize } from './classes';

/** A row of chips that scrolls sideways on a phone and sits in the page's padding from 640 px. */
export function ChipRow({ className, ...rest }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={[
        '-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

/** A chip's count. */
export function ChipCount({
  on,
  children,
}: {
  on: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={[
        'num inline-flex h-[18px] items-center rounded-full px-1.5 text-[12px] font-semibold',
        on ? 'bg-white/22 text-white' : 'bg-neutral-100 text-fg-muted',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean;
  count?: number | null;
  size?: ChipSize;
}

/** A filter or choice chip (the prototype's `.chip`); a chip that goes somewhere is a link with `chipClass`. */
export function Chip({
  on = false,
  count = null,
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps): React.JSX.Element {
  return (
    <button
      type={type}
      aria-pressed={on}
      className={[chipClass(on, size), className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
      {count === null ? null : <ChipCount on={on}>{count}</ChipCount>}
    </button>
  );
}
