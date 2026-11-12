import { Icon } from './icon';

/** A list of short claims with a teal tick, used by pricing cards and feature spotlights. `circled` draws
    the tick on a pale teal disc, the pricing card's style in the sketch. `quiet` is the smaller list a plan card
    keeps under its main lines (the sketch's `ul.more`). */
export function CheckList({
  items,
  tone = 'dark',
  circled = false,
  quiet = false,
  className = '',
}: {
  items: string[];
  tone?: 'dark' | 'light';
  circled?: boolean;
  quiet?: boolean;
  className?: string;
}) {
  const text = tone === 'dark' ? 'text-neutral-700' : 'text-white/90';
  const tick = tone === 'dark' ? 'text-brand-700' : 'text-brand-300';
  const disc = quiet ? 'h-4 w-4' : 'h-[18px] w-[18px]';
  return (
    <ul className={`${quiet ? 'space-y-1.5' : 'space-y-2.5'} ${className}`}>
      {items.map((item) => (
        <li
          key={item}
          className={`flex items-start gap-2.5 ${quiet ? 'text-[14px]' : 'text-[15px]'} ${text}`}
        >
          {circled ? (
            <span
              className={`mt-[2px] flex ${disc} shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700`}
            >
              <Icon name="check" size={quiet ? 10 : 12} strokeWidth={3} />
            </span>
          ) : (
            <Icon name="check" size={18} className={`mt-[3px] ${tick}`} strokeWidth={2.5} />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
