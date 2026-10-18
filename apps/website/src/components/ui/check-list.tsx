import { Icon } from './icon';

/** A list of short claims with a teal tick, used by pricing cards and feature spotlights. `circled` draws
    the tick on a pale teal disc, the pricing card's style in the sketch. */
export function CheckList({
  items,
  tone = 'dark',
  circled = false,
  className = '',
}: {
  items: string[];
  tone?: 'dark' | 'light';
  circled?: boolean;
  className?: string;
}) {
  const text = tone === 'dark' ? 'text-neutral-700' : 'text-white/90';
  const tick = tone === 'dark' ? 'text-brand-700' : 'text-brand-300';
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className={`flex items-start gap-2.5 text-[15px] ${text}`}>
          {circled ? (
            <span className="mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <Icon name="check" size={12} strokeWidth={3} />
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
