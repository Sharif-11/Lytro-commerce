// The classes of the dashboard's buttons and chips, for a link that looks like one (the prototype's `.btn`, `.chip`).

export type ButtonTone = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'xs';

const TONES: Record<ButtonTone, string> = {
  primary: 'bg-primary text-white',
  // The one accent per screen: marigold with ink text (TENANT-DASHBOARD-DESIGN §5.2).
  accent: 'bg-accent text-on-accent',
  outline: 'border border-line-strong bg-surface text-fg-muted',
  ghost: 'text-primary',
  danger: 'bg-danger text-white',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'h-12 px-5 text-[15px]',
  sm: 'h-9 px-3.5 text-[14px]',
  xs: 'h-8 px-3 text-[13px]',
};

/** The classes of a button, for a link that looks like one. */
export function buttonClass(
  tone: ButtonTone = 'primary',
  size: ButtonSize = 'md',
  wide = false,
): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-[8px] text-center leading-[1.2] font-semibold whitespace-normal',
    'disabled:cursor-default disabled:opacity-50',
    SIZES[size],
    TONES[tone],
    tone === 'ghost' ? '!px-3' : '',
    wide ? 'w-full' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** A chip's classes: 36 px, or 32 px for a hub's section chips. */
export function chipClass(on: boolean, compact = false): string {
  return [
    'inline-flex flex-none items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium whitespace-nowrap',
    compact ? 'h-8' : 'h-9',
    on ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-fg-muted',
  ].join(' ');
}
