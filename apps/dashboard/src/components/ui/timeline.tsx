import type { ReactNode } from 'react';

/** A step's dot: done, failed, or yet to come. */
export type TimelineDot = 'on' | 'bad' | 'plain';

/**
 * One step of a timeline (the prototype's `.tl`): its dot, joined to the next step's by a line; what happened, with a
 * smaller line under it; and when, at its end. A payment's "What happened" and a variant's stock history use it.
 */
export function TimelineRow({
  dot,
  text,
  sub,
  when,
}: {
  dot: TimelineDot;
  text: ReactNode;
  sub?: ReactNode;
  when: ReactNode;
}): React.JSX.Element {
  return (
    <div className="relative grid grid-cols-[20px_1fr_auto] gap-x-3 py-1.5 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-[18px] [&:not(:last-child)]:before:-bottom-2 [&:not(:last-child)]:before:left-[9px] [&:not(:last-child)]:before:w-0.5 [&:not(:last-child)]:before:bg-neutral-100 [&:not(:last-child)]:before:content-['']">
      <span
        className={[
          'relative z-10 mx-auto mt-1.5 size-2.5 rounded-full',
          dot === 'on' ? 'bg-primary' : dot === 'bad' ? 'bg-danger' : 'bg-neutral-300',
        ].join(' ')}
      />
      <span className="text-[15px]">
        {text}
        {sub ? <small className="block text-[13px] text-fg-muted">{sub}</small> : null}
      </span>
      <span className="num text-[13px] whitespace-nowrap text-fg-subtle">{when}</span>
    </div>
  );
}
