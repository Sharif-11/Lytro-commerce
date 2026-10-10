import type { InputHTMLAttributes, ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: ReactNode;
  /** A fixed label after the input, inside the field's border (e.g. ".lytro.com" on the shop URL field). */
  suffix?: ReactNode;
}

export function TextField({
  label,
  error,
  icon,
  suffix,
  id,
  name,
  className,
  ...props
}: TextFieldProps): React.JSX.Element {
  const inputId = id ?? name;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <div
        className={`flex items-center rounded-xl border bg-white shadow-sm transition focus-within:ring-2 ${
          error
            ? 'border-red-300 focus-within:border-red-400 focus-within:ring-red-400/30'
            : 'border-slate-200 focus-within:border-brand-500 focus-within:ring-brand-500/30'
        }`}
      >
        {icon ? <span className="flex items-center pl-3.5 text-slate-400">{icon}</span> : null}
        <input
          id={inputId}
          name={name}
          {...props}
          className={`min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none ${
            icon ? 'pl-2' : ''
          } ${suffix ? 'pr-1' : ''} ${className ?? ''}`}
        />
        {suffix ? (
          <span className="shrink-0 pr-4 text-base whitespace-nowrap text-slate-400">{suffix}</span>
        ) : null}
      </div>
      {error ? <span className="mt-1.5 block text-sm text-red-600">{error}</span> : null}
    </label>
  );
}
