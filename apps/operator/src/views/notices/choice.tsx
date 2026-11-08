import type { ReactNode } from 'react';

/**
 * One of a few choices, as the sketch draws them: a ring, the words and a line of help, and under them, once chosen,
 * what the choice opens (its own fields, kept outside the label so they stay their own controls).
 */
export function Choice({
  name,
  on,
  label,
  help,
  onPick,
  children,
}: {
  name: string;
  on: boolean;
  label: string;
  help?: string;
  onPick: () => void;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-lg border px-3 py-2.5 ${
        on ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
      }`}
    >
      <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
        <input type="radio" name={name} checked={on} onChange={onPick} className="sr-only" />
        <span
          aria-hidden="true"
          className={`mt-0.5 size-[18px] flex-none rounded-full bg-surface ${
            on ? 'border-[5px] border-primary' : 'border-[1.5px] border-line-strong'
          }`}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold">{label}</span>
          {help ? <span className="text-[13px] leading-[1.5] text-fg-muted">{help}</span> : null}
        </span>
      </label>
      {on && children ? <div className="mt-0.5 ml-7 flex min-w-0 flex-col">{children}</div> : null}
    </div>
  );
}

/** A group of choices, stacked. */
export function Choices({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="flex flex-col gap-2">{children}</div>;
}
