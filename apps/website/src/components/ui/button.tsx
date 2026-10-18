import Link from 'next/link';
import type { ReactNode } from 'react';

export type ButtonTone = 'accent' | 'primary' | 'outline' | 'ghost' | 'light' | 'light-outline';
export type ButtonSize = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-normal text-center leading-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500';

// BRAND-IDENTITY.md §4: marigold is the one accent per screen; teal 700 is the ordinary primary; the rest
// are quiet. Every button is at least 44 px tall so it is a real tap target on a phone.
const tones: Record<ButtonTone, string> = {
  accent: 'bg-accent-500 text-ink hover:bg-[#e0970f] shadow-accent',
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  outline:
    'border border-neutral-200 bg-white text-ink hover:border-brand-700 hover:text-brand-800',
  ghost: 'text-brand-800 hover:bg-brand-50',
  light: 'bg-white text-brand-900 hover:bg-brand-50',
  'light-outline': 'border border-white/35 text-white hover:bg-white/10',
};

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-[15px]',
  lg: 'min-h-12 px-5 text-base',
};

export function buttonClass(tone: ButtonTone, size: ButtonSize = 'md', extra = ''): string {
  return `${base} ${tones[tone]} ${sizes[size]} ${extra}`.trim();
}

export function ButtonLink({
  href,
  tone = 'primary',
  size = 'md',
  className = '',
  children,
  external = false,
}: {
  href: string;
  tone?: ButtonTone;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  /** Links to another host (the dashboard) are plain anchors; Next's Link is for this site only. */
  external?: boolean;
}) {
  const classes = buttonClass(tone, size, className);
  if (external || href.startsWith('http') || href.startsWith('#')) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
