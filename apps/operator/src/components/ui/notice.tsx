import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'bg-surface-alt text-fg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** One short message in a tinted box. */
export function Notice({
  tone = 'info',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-control px-4 py-3 text-[14px] ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return <Notice tone="danger">{message}</Notice>;
}
