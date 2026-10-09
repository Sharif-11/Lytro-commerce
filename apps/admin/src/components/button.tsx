import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'outline';
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

export function Button({
  loading = false,
  variant = 'primary',
  disabled,
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const base =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';
  const variants = {
    primary:
      'bg-linear-to-br from-brand-500 to-brand-600 text-white shadow-md shadow-brand-600/25 hover:shadow-lg hover:shadow-brand-600/30 hover:-translate-y-0.5',
    ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
    outline:
      'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50',
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className ?? ''}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}
