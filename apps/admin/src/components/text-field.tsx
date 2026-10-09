import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({
  label,
  error,
  id,
  name,
  className,
  ...props
}: TextFieldProps): React.JSX.Element {
  const inputId = id ?? name;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input
        id={inputId}
        name={name}
        {...props}
        className={`w-full rounded-xl border px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 ${error ? 'border-red-400' : 'border-slate-200'} ${className ?? ''}`}
      />
      {error ? <span className="mt-1 block text-sm text-red-600">{error}</span> : null}
    </label>
  );
}
