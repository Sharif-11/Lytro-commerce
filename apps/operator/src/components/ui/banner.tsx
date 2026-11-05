import type { ReactNode } from 'react';
import { ConsoleIcon, type ConsoleIconName } from './console-icon';

type Tone = 'bad' | 'warn' | 'info';

const tones: Record<Tone, string> = {
  bad: 'border-[#f3c3c6] bg-danger-soft text-[#7a1f25]',
  warn: 'border-[#f1d996] bg-warning-soft text-[#6a4203]',
  info: 'border-brand-200 bg-info-soft text-brand-800',
};

/** A message with its icon: a refusal, a warning, or what a page isn't yet. */
export function Banner({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon: ConsoleIconName;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[14px] ${tones[tone]}`}
    >
      <ConsoleIcon name={icon} size={18} className="mt-px" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
