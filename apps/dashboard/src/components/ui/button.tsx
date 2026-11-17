import type { ButtonHTMLAttributes } from 'react';
import { buttonClass, type ButtonSize, type ButtonTone } from './classes';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Full width (a sheet's or a phone page's main action). */
  wide?: boolean;
  /** Its request is on its way: the button holds still and says so to assistive technology. */
  busy?: boolean;
}

/**
 * The dashboard's button (the prototype's `.btn`): 48 px, or 36 and 32 px for the smaller rows. At work it shows a
 * spinner where its icon is and keeps its label and width (Fixes · UI/UX batch 2's `ux-loading-save`; index.css).
 */
export function Button({
  tone = 'primary',
  size = 'md',
  wide = false,
  busy = false,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      data-busy={busy || undefined}
      data-size={size}
      data-wide={wide || undefined}
      className={[buttonClass(tone, size, wide), className].filter(Boolean).join(' ')}
      {...rest}
    >
      {busy ? <span className="btn-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
