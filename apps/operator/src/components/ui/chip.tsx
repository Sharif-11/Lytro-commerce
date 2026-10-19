import type { ReactNode } from 'react';

/** A selectable pill, 40 px tall: filters and kind pickers. */
export function Chip({
  selected = false,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
        selected
          ? 'border-brand-400 bg-brand-400 text-ink'
          : 'border-line-strong bg-transparent text-fg-muted hover:border-brand-300 hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

/** A small label pill that is not a control: states and kinds. */
export function Tag({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'danger';
  children: ReactNode;
}): React.JSX.Element {
  const tones = {
    neutral: 'bg-surface-alt text-fg-muted',
    brand: 'bg-brand-400/15 text-brand-300',
    accent: 'bg-accent-300/15 text-accent-300',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
