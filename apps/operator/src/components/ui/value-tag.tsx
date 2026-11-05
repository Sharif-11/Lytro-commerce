import type { ButtonHTMLAttributes, ReactNode } from 'react';

type TagTone = 'plain' | 'on' | 'strike';

const TONES: Record<TagTone, string> = {
  plain: 'bg-neutral-100 text-neutral-700',
  on: 'bg-brand-100 text-brand-800',
  strike: 'bg-neutral-100 text-neutral-700 line-through',
};

function tagClass(tone: TagTone, small: boolean): string {
  return `inline-flex items-center rounded-full font-medium ${
    small ? 'h-[22px] px-2 text-[12px]' : 'h-[26px] px-[9px] text-[13px]'
  } ${TONES[tone]}`;
}

/** A word shown as a chip: a value, a flag, a suggestion. */
export function ValueTag({
  tone = 'plain',
  small = false,
  children,
}: {
  tone?: TagTone;
  small?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return <span className={tagClass(tone, small)}>{children}</span>;
}

/** The same chip as something to tap: a flag to turn off, the plus that adds one. */
export function TagButton({
  tone = 'plain',
  children,
  ...props
}: {
  tone?: TagTone;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button type="button" {...props} className={`${tagClass(tone, false)} gap-1`}>
      {children}
    </button>
  );
}

export function TagLine({ children }: { children: ReactNode }): React.JSX.Element {
  return <span className="flex flex-wrap gap-1.5">{children}</span>;
}

/** A value's colour. */
export function Swatch({ color, size = 14 }: { color: string; size?: number }): React.JSX.Element {
  return (
    <span
      className="mr-1.5 inline-block rounded-full border border-black/15 align-middle"
      style={{ background: color, width: size, height: size }}
    />
  );
}
