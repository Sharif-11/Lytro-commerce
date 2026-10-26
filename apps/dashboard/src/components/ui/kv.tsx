import type { ReactNode } from 'react';

interface KvProps {
  label: ReactNode;
  value: ReactNode;
  /** The sum's line: both sides in the text colour, a little heavier. */
  total?: boolean;
}

/** A label and its figure on one line, a hairline between two of them (the prototype's `.kv`). */
export function Kv({ label, value, total = false }: KvProps): React.JSX.Element {
  return (
    <div className="kv flex justify-between gap-3 py-2 text-[15px] [.kv+&]:border-t [.kv+&]:border-line">
      <span className={total ? 'text-[16px] font-semibold text-fg' : 'text-fg-muted'}>{label}</span>
      <span
        className={[
          'num text-right',
          total ? 'text-[16px] font-semibold text-fg' : 'font-medium',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

/** A choice's dot (the prototype's `.radio`): 22 px, its ring filled in when chosen. */
export function RadioMark({ on }: { on: boolean }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={[
        'size-[22px] flex-none rounded-full border-solid',
        on ? 'border-[7px] border-primary' : 'border-2 border-neutral-300',
      ].join(' ')}
    />
  );
}
