import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon';

export type BannerTone = 'info' | 'warn' | 'neutral' | 'bad';

const TONES: Record<BannerTone, string> = {
  info: 'bg-info-soft text-info-text',
  warn: 'bg-warning-soft text-warning',
  neutral: 'bg-neutral-100 text-fg-muted',
  // The drawn red on its pink is 4.45:1, under AA; the darker role, as Activity's Failed tag (Slice 11.6).
  bad: 'bg-danger-soft text-danger-text',
};

interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  /** The way out it names, at its end ("See plans", "Renew"). */
  action?: ReactNode;
  /** In place of the tone's own icon (New order's known customer, a person). */
  icon?: IconName;
  /** Inside a card, 10 by 12 px around (the sketch's known-customer note). */
  dense?: boolean;
}

/** A banner at the top of a page (the prototype's `.banner`): one sentence and at most one way out. */
export function Banner({
  tone,
  children,
  action,
  icon,
  dense = false,
}: BannerProps): React.JSX.Element {
  return (
    <div
      role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-card text-[14px] leading-[1.5] ${dense ? 'px-3 py-2.5' : 'px-4 py-3'} ${TONES[tone]}`}
    >
      <span className="mt-0.5">
        <Icon name={icon ?? (tone === 'warn' || tone === 'bad' ? 'alert' : 'info')} />
      </span>
      <span className="flex-1">{children}</span>
      {action ? (
        <span className="font-semibold whitespace-nowrap [&_a]:no-underline">{action}</span>
      ) : null}
    </div>
  );
}
