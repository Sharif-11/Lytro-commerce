import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** No padding: a list of rows runs edge to edge inside it. */
  flush?: boolean;
}

/** A white card with a hairline and a 10 px radius, no shadow (TENANT-DASHBOARD-DESIGN §5.1). */
export function Card({ flush = false, className, ...rest }: CardProps): React.JSX.Element {
  return (
    <div
      className={[
        'rounded-card border border-line bg-surface',
        flush ? 'overflow-hidden' : 'p-card',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}
