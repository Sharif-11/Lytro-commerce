import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'outline';
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
    'inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-base font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';
  const variants = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
    ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className ?? ''}`}
    >
      {loading ? '…' : children}
    </button>
  );
}
