import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';

interface CheckRowProps {
  checked: boolean;
  onChange: () => void;
  title: ReactNode;
  sub?: ReactNode;
  disabled?: boolean;
  /** In its own bordered card (a role in the staff sheets), not a bare line (a permission in the role editor). */
  card?: boolean;
}

/**
 * One choice with a tick (the prototype's `.checkbox` in a `.row`): a 22 px box, 6 px corners, filled when ticked; the
 * choice's name over what it means. A native checkbox under the drawn one, so the keyboard and screen readers have it.
 */
export function CheckRow({
  checked,
  onChange,
  title,
  sub,
  disabled = false,
  card = false,
}: CheckRowProps): React.JSX.Element {
  return (
    <label
      className={[
        'flex items-center gap-3',
        card ? 'min-h-14 rounded-card border border-line bg-surface p-3' : 'min-h-10',
        disabled ? 'cursor-default' : 'cursor-pointer',
      ].join(' ')}
    >
      <span className="relative flex size-[22px] flex-none">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="peer size-[22px] appearance-none rounded-[6px] border-2 border-neutral-300 bg-surface checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
        />
        <span className="pointer-events-none absolute inset-0 hidden items-center justify-center text-white peer-checked:flex [&_svg]:stroke-[3]">
          <Icon name="check" size={14} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{title}</span>
        {sub ? <span className="text-[14px] text-fg-muted">{sub}</span> : null}
      </span>
    </label>
  );
}
