import type { ReactNode } from 'react';

export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

const TONES: Record<StatusTone, string> = {
  ok: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-neutral-100 text-fg-muted',
};

/**
 * A status in a pill (the prototype's `.st`): only status colours carry status (BRN-04). `small` is the 20 px pill a
 * row's line of facts carries (the prototype's `.addon .meta .st`).
 */
export function StatusTag({
  tone,
  small = false,
  children,
}: {
  tone: StatusTone;
  small?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 font-semibold whitespace-nowrap ${small ? 'h-5 text-[11px]' : 'h-[22px] text-[12px]'} ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
