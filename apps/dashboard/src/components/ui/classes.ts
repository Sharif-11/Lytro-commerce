// The classes of the dashboard's buttons and chips, for a link that looks like one (the prototype's `.btn`, `.chip`).

export type ButtonTone = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'xs';

const TONES: Record<ButtonTone, string> = {
  primary: 'bg-primary text-on-primary',
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
    'inline-flex items-center justify-center gap-2 rounded-button text-center leading-[1.2] font-semibold whitespace-normal',
    'disabled:cursor-default disabled:opacity-50',
    SIZES[size],
    TONES[tone],
    tone === 'ghost' ? '!px-3' : '',
    wide ? 'w-full' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** A chip's height: 32 px for a hub's section chips, 36 px for filters, 40 px for a step's answers. */
export type ChipSize = 'sm' | 'md' | 'lg';

const CHIP_HEIGHTS: Record<ChipSize, string> = { sm: 'h-8', md: 'h-9', lg: 'h-10' };

/** A chip's classes. */
export function chipClass(on: boolean, size: ChipSize = 'md'): string {
  return [
    'inline-flex flex-none items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium whitespace-nowrap',
    CHIP_HEIGHTS[size],
    on ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-fg-muted',
  ].join(' ');
}
