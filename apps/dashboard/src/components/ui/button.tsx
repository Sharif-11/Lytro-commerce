import type { ButtonHTMLAttributes } from 'react';

type Tone = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  tone?: Tone;
  /** Buttons fill their row on phones by default; `fit` keeps one to its content. */
  fit?: boolean;
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

// BRAND-IDENTITY §4: teal 700 is the ordinary primary, marigold the one accent per screen. Every button is
// at least 48 px tall so it is a real tap target, and long Bangla labels wrap instead of overflowing.
const tones: Record<Tone, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  accent: 'bg-accent-500 text-ink hover:bg-[#e0970f]',
  outline:
    'border border-line-strong bg-white text-ink hover:border-brand-700 hover:text-brand-800',
  ghost: 'text-brand-800 hover:bg-brand-50',
  danger: 'bg-danger text-white hover:bg-[#a9262e]',
};

export function Button({
  loading = false,
  tone = 'primary',
  fit = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-center text-base leading-tight font-semibold whitespace-normal transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
        fit ? '' : 'w-full'
      } ${tones[tone]} ${className ?? ''}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}
