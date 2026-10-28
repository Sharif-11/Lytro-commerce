import type { ReactNode } from 'react';
import { RadioMark } from '@/components/ui/kv';

/** One choice of several in a bordered list (the prototype's `.card.flush.list` of `.radio` rows). */
export function ChoiceList({
  label,
  bare = false,
  children,
}: {
  label: string;
  /** Rows on the page, without the list's border (the Stock and delivery card's two). */
  bare?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      // Bare, the rows keep the card's own 12 px apart, as drawn.
      className={
        bare ? 'flex flex-col gap-3' : 'flex-none overflow-hidden rounded-card border border-line'
      }
    >
      {children}
    </div>
  );
}

export function ChoiceRow({
  on,
  title,
  sub,
  trail,
  bare = false,
  disabled = false,
  later = false,
  indent = 0,
  onChoose,
}: {
  on: boolean;
  title: ReactNode;
  sub?: ReactNode;
  /** Beside the words: an amount, or a field (the partial advance). */
  trail?: ReactNode;
  bare?: boolean;
  disabled?: boolean;
  /** Greyed, as the prototype's `.later`: a choice that cannot be made here, with why under it. */
  later?: boolean;
  /** How far in from the list's edge, past its padding: a category under another (the parent step). */
  indent?: number;
  onChoose: () => void;
}): React.JSX.Element {
  return (
    <div
      className={[
        'flex items-center gap-3',
        bare ? 'min-h-10' : 'min-h-12 border-b border-line px-4 py-2 last:border-b-0',
        later ? 'opacity-55' : '',
      ].join(' ')}
      style={indent > 0 ? { paddingLeft: `${String(16 + indent)}px` } : undefined}
    >
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled || later}
        onClick={onChoose}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <RadioMark on={on} />
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px]">{title}</span>
          {sub ? <span className="text-[13px] text-fg-muted">{sub}</span> : null}
        </span>
      </button>
      {trail}
    </div>
  );
}
