import type { ReactNode } from 'react';

type NoticeTone = 'info' | 'warn' | 'ok';

const TONES: Record<NoticeTone, string> = {
  info: 'bg-info-soft text-brand-900',
  warn: 'bg-warning-soft text-accent-700',
  ok: 'bg-success-soft text-success',
};

/**
 * The prototype's `.notice`: a step's one-line word in its card -- the earlier shop's balance coming along, a refusal
 * that kept everything typed, a payment received. Quieter than the shell's banner: no icon, the card's own corners.
 */
export function Notice({
  tone,
  children,
}: {
  tone: NoticeTone;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={['rounded-[8px] px-3 py-2.5 text-[14px] leading-[1.5]', TONES[tone]].join(' ')}
    >
      {children}
    </div>
  );
}
