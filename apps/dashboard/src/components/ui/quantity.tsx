import { useState } from 'react';
import { Icon } from '@/components/icon';

/**
 * The sketch's `.qty`: one less, how many, one more, between the least and the most allowed (an add-on's one request,
 * Slice 11.5c; the units an order's return takes back, Slice 4.8a).
 */
export function Quantity({
  value,
  least = 1,
  most,
  typed = false,
  label,
  onChange,
}: {
  value: number;
  least?: number;
  /** The most it steps to; none for no cap (an add-on, item 4.2). */
  most?: number;
  /** The number can be typed as well as stepped (the prototype's `ux-addon-buy`): any whole number from `least`. */
  typed?: boolean;
  label: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const step = 'flex size-10 items-center justify-center bg-white text-primary disabled:opacity-40';
  return (
    <span className="inline-flex flex-none items-center overflow-hidden rounded-[8px] border border-line-strong">
      <button
        type="button"
        className={step}
        aria-label={`${label} −`}
        disabled={value <= least}
        onClick={() => {
          setDraft(null);
          onChange(value - 1);
        }}
      >
        <Icon name="minus" />
      </button>
      {/* The sketch's `.qty span`: 44 px at least, bold, a hairline either side; typed, 64 px with the brand's 2 px ring
          while it has the focus (`.ux-qin`). */}
      {typed ? (
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          className="num h-10 w-16 border-x border-line text-center text-[16px] font-bold outline-none focus:mx-0.5 focus:h-9 focus:rounded-[6px] focus:border-2 focus:border-primary"
          value={draft ?? String(value)}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 7);
            setDraft(digits);
            const next = Number(digits);
            if (digits !== '' && next >= least && (most === undefined || next <= most)) {
              onChange(next);
            }
          }}
          onBlur={() => {
            setDraft(null);
          }}
        />
      ) : (
        <span
          className="num h-10 min-w-11 border-x border-line text-center text-[16px] leading-10 font-bold"
          aria-live="polite"
        >
          {value}
        </span>
      )}
      <button
        type="button"
        className={step}
        aria-label={`${label} +`}
        disabled={most !== undefined && value >= most}
        onClick={() => {
          setDraft(null);
          onChange(value + 1);
        }}
      >
        <Icon name="plus" />
      </button>
    </span>
  );
}
