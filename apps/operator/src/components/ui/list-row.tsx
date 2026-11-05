import type { ReactNode } from 'react';
import { ConsoleIcon, type ConsoleIconName } from './console-icon';

/** A row in a list that runs to its card's edges. */
export const LIST_ROW =
  'flex min-h-[60px] w-full flex-none items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0';

/** The list itself, pulled out to the edges of a card's padding. */
export function CardList({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="-mx-4 -mb-4 mt-2 flex flex-col">{children}</div>;
}

/** A row's lines; `wrap` lets long words run on rather than cut off. */
export function RowLines({
  title,
  detail,
  wrap = false,
  className = '',
}: {
  title: ReactNode;
  detail?: ReactNode;
  wrap?: boolean;
  className?: string;
}): React.JSX.Element {
  const line = wrap ? '' : 'truncate';
  return (
    <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${className}`}>
      <span className={`text-[15px] font-medium ${line}`}>{title}</span>
      {detail ? <span className={`text-[13px] text-fg-muted ${line}`}>{detail}</span> : null}
    </span>
  );
}

/** The icon a row opens with. */
export function RowIcon({ name }: { name: ConsoleIconName }): React.JSX.Element {
  return (
    <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
      <ConsoleIcon name={name} />
    </span>
  );
}
