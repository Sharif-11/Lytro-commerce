import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from '@/components/icon';

/** A row's classes (the prototype's `.row`): 64 px at least, for a button or a link that is one. */
export const rowClass =
  'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-[inherit] no-underline';

/** A list of rows divided by hairlines, inside a flush card. */
export function RowList({ className, ...rest }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={['flex flex-col [&>*+*]:border-t [&>*+*]:border-line', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

/** A row's square at the start: an initial, an icon or a picture. */
export function RowLead({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={[
        'flex size-10 flex-none items-center justify-center overflow-hidden rounded-button bg-neutral-100 font-semibold text-fg-muted',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

/** A row's two lines: the name, and what it is under it. */
export function RowText({ title, sub }: { title: ReactNode; sub?: ReactNode }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="min-w-0 overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap">
        {title}
      </span>
      {sub ? (
        <span className="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
          {sub}
        </span>
      ) : null}
    </span>
  );
}

/** A row's end: an amount over a tag on a phone, side by side from 640 px. */
export function RowTrail({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="flex flex-none flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-4">
      {children}
    </span>
  );
}

export function RowChevron(): React.JSX.Element {
  return (
    <span className="text-neutral-400">
      <Icon name="right" />
    </span>
  );
}
