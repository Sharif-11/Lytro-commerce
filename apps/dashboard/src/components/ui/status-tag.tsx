import type { ReactNode } from 'react';

export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

const TONES: Record<StatusTone, string> = {
  ok: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-neutral-100 text-fg-muted',
};

/** A status in a pill (the prototype's `.st`): only status colours carry status (BRN-04). */
export function StatusTag({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-full px-2 text-[12px] font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
