import type { InputHTMLAttributes, ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** A fixed label before the input (the phone field's +880). Not `prefix`: that is an HTML attribute. */
  leading?: ReactNode;
  /** A fixed label after the input (the shop link's `.lytro.app`). */
  suffix?: ReactNode;
}

/** The one text input: 48 px tall, 16 px text so phones never zoom, the error or hint under it. */
export function TextField({
  label,
  error,
  hint,
  leading,
  suffix,
  id,
  name,
  className,
  ...props
}: TextFieldProps): React.JSX.Element {
  const inputId = id ?? name;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-[14px] font-bold text-ink">{label}</span>
      <div
        className={`flex min-h-12 items-center rounded-control border bg-white transition focus-within:ring-2 ${
          error
            ? 'border-danger focus-within:ring-danger/25'
            : 'border-neutral-200 focus-within:border-brand-700 focus-within:ring-brand-500/25'
        }`}
      >
        {leading ? (
          <span className="num shrink-0 border-r border-line pr-3 pl-3.5 text-base font-semibold text-neutral-700">
            {leading}
          </span>
        ) : null}
        <input
          id={inputId}
          name={name}
          {...props}
          className={`num min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:outline-none ${className ?? ''}`}
        />
        {suffix ? (
          <span className="num shrink-0 pr-3.5 text-[15px] font-semibold whitespace-nowrap text-neutral-700">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-[13px] font-semibold text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-neutral-700">{hint}</span>
      ) : null}
    </label>
  );
}
