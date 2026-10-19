import type { ButtonHTMLAttributes } from 'react';

type Tone = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  tone?: Tone;
  /** Buttons fill their row on phones by default; `fit` keeps one to its content. */
  fit?: boolean;
  /** A 40 px row button for tables and inline forms. */
  small?: boolean;
}

function Spinner(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2Z"
      />
    </svg>
  );
}

// BRAND-IDENTITY §8.4: on the dark console the primary is teal-400 with ink text, the accent marigold-300.
const tones: Record<Tone, string> = {
  primary: 'bg-brand-400 text-ink hover:bg-brand-300',
  accent: 'bg-accent-300 text-ink hover:bg-accent-100',
  outline:
    'border border-line-strong bg-transparent text-fg hover:border-brand-300 hover:text-brand-300',
  ghost: 'text-brand-300 hover:bg-surface-hover',
  danger: 'bg-danger-soft text-danger ring-1 ring-danger/40 hover:bg-danger/25',
};

export function Button({
  loading = false,
  tone = 'primary',
  fit = false,
  small = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-control text-center leading-tight font-semibold whitespace-normal transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-chrome focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
        small ? 'min-h-10 px-3.5 py-1.5 text-[14px]' : 'min-h-12 px-4 py-2.5 text-[15px]'
      } ${fit ? '' : 'w-full'} ${tones[tone]} ${className ?? ''}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}
