import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from '@/components/icon';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: ReactNode;
  /** Shown before the value, inside the control (`+880`, `৳`). */
  prefix?: ReactNode;
  /** Shown after the value, inside the control (`.lytro.app`, a Copy button). */
  suffix?: ReactNode;
  help?: ReactNode;
  /** The server's or the form's own wording; the control turns red. */
  error?: ReactNode;
}

/** A labelled text field (the prototype's `.field`): a 48 px control with a 6 px radius, its help or error under it. */
export function Field({
  label,
  prefix,
  suffix,
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
        {suffix ? (
          <span className="font-medium whitespace-nowrap text-fg-muted">{suffix}</span>
        ) : null}
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

interface AreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
}

/** A labelled box for several lines (the prototype's `.ctl.ta`): 96 px at least, padded 12 px all round. */
export function AreaField({
  label,
  help,
  error,
  id,
  className,
  ...rest
}: AreaFieldProps): React.JSX.Element {
  const own = useId();
  const inputId = id ?? own;
  const noteId = `${inputId}-note`;
  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="text-[14px] font-medium text-fg-muted">
        {label}
      </label>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? noteId : undefined}
        className={[
          'min-h-24 resize-y rounded-control border bg-surface p-3 text-[16px] outline-none placeholder:text-fg-subtle focus:outline-2 focus:outline-offset-1 focus:outline-focus',
          error ? 'border-danger' : 'border-line-strong',
        ].join(' ')}
        {...rest}
      />
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

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  help?: ReactNode;
  options: readonly { value: string; label: string }[];
}

/** A labelled choice from a list (the prototype's field with the `down` chevron): the browser's own list opens. */
export function SelectField({
  label,
  help,
  options,
  id,
  className,
  ...rest
}: SelectFieldProps): React.JSX.Element {
  const own = useId();
  const inputId = id ?? own;
  const noteId = `${inputId}-note`;
  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="text-[14px] font-medium text-fg-muted">
        {label}
      </label>
      <span className="relative flex">
        <select
          id={inputId}
          aria-describedby={help ? noteId : undefined}
          className="h-12 w-full appearance-none rounded-control border border-line-strong bg-surface pr-10 pl-3 text-[16px] text-fg outline-none focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg">
          <Icon name="down" />
        </span>
      </span>
      {help ? (
        <p id={noteId} className="text-[13px] text-fg-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
