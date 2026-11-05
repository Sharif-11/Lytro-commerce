import type { ReactNode } from 'react';

export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';

const tones: Record<ChipTone, string> = {
  ok: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger-text',
  info: 'bg-info-soft text-info',
  mute: 'bg-neutral-100 text-neutral-700',
};

/** A status in one word: each colour has one meaning. `plain` drops the dot, for a fact rather than a state. */
export function StatusChip({
  tone,
  plain = false,
  children,
}: {
  tone: ChipTone;
  plain?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-[5px] rounded-full px-2 align-middle text-[12px] font-semibold whitespace-nowrap ${tones[tone]}`}
    >
      {plain ? null : <i className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
