import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** A fixed label before the input (the phone field's +880, a currency sign). Not `prefix`: that is an HTML attribute. */
  leading?: ReactNode;
  /** A fixed label after the input (the shop link's `.lytro.app`, a unit). */
  suffix?: ReactNode;
  /** Monospace digits and letters, for codes and ids. */
  mono?: boolean;
}

const shell = (error: boolean) =>
  `flex min-h-12 items-center rounded-control border bg-field transition focus-within:ring-2 ${
    error
      ? 'border-danger focus-within:ring-field-error-ring'
      : 'border-control-line focus-within:border-line-active focus-within:ring-field-ring'
  }`;

/** The one text input: 48 px tall, 16 px text so phones never zoom, the error or hint under it. */
export function TextField({
  label,
  error,
  hint,
  leading,
  suffix,
  mono = false,
  id,
  name,
  className,
  ...props
}: TextFieldProps): React.JSX.Element {
  const inputId = id ?? name;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-label font-bold text-fg">{label}</span>
      <div className={shell(Boolean(error))}>
        {leading ? (
          <span className="num shrink-0 border-r border-line pr-3 pl-3.5 text-ui font-semibold text-fg-muted">
            {leading}
          </span>
        ) : null}
        <input
          id={inputId}
          name={name}
          {...props}
          className={`${mono ? 'mono' : 'num'} min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-base text-fg placeholder:text-placeholder focus:outline-none disabled:opacity-field-disabled ${className ?? ''}`}
        />
        {suffix ? (
          <span className="num shrink-0 pr-3.5 text-copy font-semibold whitespace-nowrap text-fg-muted">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-[13px] font-semibold text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-fg-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/** A labelled textarea in the same clothes, for reasons and notes. */
export function TextArea({
  label,
  error,
  id,
  name,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const inputId = id ?? name;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-label font-bold text-fg">{label}</span>
      <div className={shell(Boolean(error))}>
        <textarea
          id={inputId}
          name={name}
          rows={3}
          {...props}
          className={`min-w-0 flex-1 resize-y bg-transparent px-3.5 py-2.5 text-base text-fg placeholder:text-placeholder focus:outline-none ${className ?? ''}`}
        />
      </div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-[13px] font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}
