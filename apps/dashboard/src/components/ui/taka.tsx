import { formatTaka } from '@lytronix/ui';

interface TakaProps {
  amount: string | number;
  /** A credit's "+" before it, as the statement writes one. */
  plus?: boolean;
  /** The paisa's own size where a figure sets it (a stat tile's 14 px); else the browser's smaller. */
  paisaClassName?: string;
}

/**
 * An amount as the prototype's `money(n, true)` draws it: the sign first, whole taka, then the paisa smaller, only when
 * there are any (BRAND-IDENTITY §5).
 */
export function Taka({ amount, plus = false, paisaClassName }: TakaProps): React.JSX.Element {
  const value = Number(amount);
  const whole = Math.trunc(Math.abs(value));
  const paisa = Math.round((Math.abs(value) - whole) * 100);
  return (
    <>
      {value < 0 ? '−' : plus && value > 0 ? '+' : ''}
      {formatTaka(whole)}
      {paisa === 0 ? null : (
        <small className={paisaClassName}>.{String(paisa).padStart(2, '0')}</small>
      )}
    </>
  );
}
