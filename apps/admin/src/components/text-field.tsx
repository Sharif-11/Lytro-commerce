import type { InputHTMLAttributes, ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: ReactNode;
}

export function TextField({
  label,
  error,
  icon,
  id,
  name,
  className,
  ...props
}: TextFieldProps): React.JSX.Element {
  const inputId = id ?? name;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          name={name}
          {...props}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-300 focus:border-red-400 focus:ring-red-400/30'
              : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500/30'
          } ${icon ? 'pl-11' : ''} ${className ?? ''}`}
        />
      </div>
      {error ? <span className="mt-1.5 block text-sm text-red-600">{error}</span> : null}
    </label>
  );
}
