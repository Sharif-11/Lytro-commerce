import type { ButtonHTMLAttributes } from 'react';
import { buttonClass, type ButtonSize, type ButtonTone } from './classes';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Full width (a sheet's or a phone page's main action). */
  wide?: boolean;
}

/** The dashboard's button (the prototype's `.btn`): 48 px, or 36 and 32 px for the smaller rows. */
export function Button({
  tone = 'primary',
  size = 'md',
  wide = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={[buttonClass(tone, size, wide), className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
