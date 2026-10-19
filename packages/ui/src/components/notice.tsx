import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** One short message in a tinted box: errors, refusals, recovery notes. */
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
      className={`rounded-control px-4 py-3 text-copy ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return <Notice tone="danger">{message}</Notice>;
}
