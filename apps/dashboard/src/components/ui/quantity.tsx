import { Icon } from '@/components/icon';

/**
 * The sketch's `.qty`: one less, how many, one more, between the least and the most allowed (an add-on's one request,
 * Slice 11.5c; the units an order's return takes back, Slice 4.8a).
 */
export function Quantity({
  value,
  least = 1,
  most,
  label,
  onChange,
}: {
  value: number;
  least?: number;
  most: number;
  label: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const step = 'flex size-10 items-center justify-center bg-white text-primary disabled:opacity-40';
  return (
    <span className="inline-flex flex-none items-center overflow-hidden rounded-[8px] border border-line-strong">
      <button
        type="button"
        className={step}
        aria-label={`${label} −`}
        disabled={value <= least}
        onClick={() => {
          onChange(value - 1);
        }}
      >
        <Icon name="minus" />
      </button>
      <span className="num w-10 text-center text-[16px] font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={step}
        aria-label={`${label} +`}
        disabled={value >= most}
        onClick={() => {
          onChange(value + 1);
        }}
      >
        <Icon name="plus" />
      </button>
    </span>
  );
}
