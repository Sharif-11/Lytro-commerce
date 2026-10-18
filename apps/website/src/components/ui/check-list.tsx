import { Icon } from './icon';

/** A list of short claims with a teal tick, used by pricing cards and feature spotlights. */
export function CheckList({
  items,
  tone = 'dark',
  className = '',
}: {
  items: string[];
  tone?: 'dark' | 'light';
  className?: string;
}) {
  const text = tone === 'dark' ? 'text-neutral-700' : 'text-white/90';
  const tick = tone === 'dark' ? 'text-brand-700' : 'text-brand-300';
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className={`flex items-start gap-2.5 text-[15px] ${text}`}>
          <Icon name="check" size={18} className={`mt-[3px] ${tick}`} strokeWidth={2.5} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
