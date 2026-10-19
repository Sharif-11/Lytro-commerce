import type { ReactNode } from 'react';

/** A selectable pill, 44 px tall, used for the set-up step's choices and the slug suggestion. */
export function Chip({
  selected = false,
  onClick,
  children,
  className = '',
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-semibold transition-colors ${
        selected
          ? 'border-brand-700 bg-brand-700 text-white'
          : 'border-neutral-200 bg-white text-neutral-700 hover:border-brand-700 hover:text-ink'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** A small label pill that is not a control: statuses and the held-address reminder. */
export function Tag({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'danger';
  children: ReactNode;
}): React.JSX.Element {
  const tones = {
    neutral: 'bg-neutral-100 text-neutral-700',
    brand: 'bg-brand-100 text-brand-800',
    accent: 'bg-accent-100 text-accent-700',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
