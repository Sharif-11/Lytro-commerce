import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: ReactNode;
  /** Shown before the value, inside the control (`+880`, `৳`). */
  prefix?: ReactNode;
  help?: ReactNode;
  /** The server's or the form's own wording; the control turns red. */
  error?: ReactNode;
}

/** A labelled text field (the prototype's `.field`): a 48 px control with a 6 px radius, its help or error under it. */
export function Field({
  label,
  prefix,
  help,
  error,
  id,
  className,
  ...rest
}: FieldProps): React.JSX.Element {
  const own = useId();
  const inputId = id ?? own;
  const noteId = `${inputId}-note`;
  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="text-[14px] font-medium text-fg-muted">
        {label}
      </label>
      <div
        className={[
          'flex h-12 items-center gap-2 rounded-control border bg-surface px-3 text-[16px] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus',
          error ? 'border-danger' : 'border-line-strong',
        ].join(' ')}
      >
        {prefix ? <span className="font-medium text-fg-muted">{prefix}</span> : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || help ? noteId : undefined}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
          {...rest}
        />
      </div>
      {error ? (
        <p id={noteId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : help ? (
        <p id={noteId} className="text-[13px] text-fg-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
