import type { ReactNode } from 'react';

/** A selectable pill (44 px on the dashboard, 40 on the console): choices, filters and kind pickers. */
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
      className={`inline-flex min-h-chip items-center gap-1.5 rounded-full border px-3.5 text-copy font-semibold transition-colors ${
        selected
          ? 'border-primary bg-primary text-on-primary'
          : 'border-control-line bg-control text-fg-muted hover:border-line-active hover:text-fg'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** A small label pill that is not a control: states, kinds and reminders. */
export function Tag({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'danger';
  children: ReactNode;
}): React.JSX.Element {
  const tones = {
    neutral: 'bg-surface-alt text-fg-muted',
    brand: 'bg-primary-soft text-primary-text',
    accent: 'bg-accent-soft text-accent-text',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-tag-y text-[12px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
