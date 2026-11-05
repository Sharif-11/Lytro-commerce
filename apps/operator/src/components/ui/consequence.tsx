import type { ReactNode } from 'react';

const edges = {
  accent: 'border-l-accent',
  danger: 'border-l-danger',
  ok: 'border-l-success',
};

/** A panel's first block: what will happen to the seller (OPERATOR-CONSOLE-DESIGN rule 3). */
export function Consequence({
  tone = 'accent',
  children,
}: {
  tone?: keyof typeof edges;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`rounded-lg border border-l-[3px] border-line bg-neutral-50 px-3.5 py-3 text-[14px] leading-[1.55] ${edges[tone]}`}
    >
      {children}
    </div>
  );
}
