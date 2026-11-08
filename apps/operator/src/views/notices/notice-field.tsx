import type { ReactNode } from 'react';

/** "45 / 120", red once past the limit or refused. */
export function Counter({ count, max, bad }: { count: number; max: number; bad: boolean }) {
  return (
    <span
      className={`text-[12px] whitespace-nowrap tabular-nums ${
        bad || count > max ? 'font-semibold text-danger' : 'text-fg-muted'
      }`}
    >
      {count.toLocaleString('en-US')} / {max.toLocaleString('en-US')}
    </span>
  );
}

/** A field as the sketch's editor draws it: the label and, at its right, a counter; under it the help or the refusal. */
export function NoticeField({
  label,
  htmlFor,
  counter,
  help,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  counter?: ReactNode;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-label font-field-label text-field-label">
          {label}
        </label>
        {counter}
      </div>
      {children}
      {help ? <div className="text-[13px] leading-[1.5] text-fg-muted">{help}</div> : null}
      {error ? (
        <div role="alert" className="text-[13px] text-danger">
          {error}
        </div>
      ) : null}
    </div>
  );
}
