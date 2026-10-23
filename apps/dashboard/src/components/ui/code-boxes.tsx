import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Icon } from '@/components/icon';

interface CodeBoxesProps {
  value: string;
  onChange: (value: string) => void;
  /** Turns every box red and says why under them (a wrong or expired code). */
  error?: string | null;
  disabled?: boolean;
  /** Names the boxes for assistive technology ("Code, digit 1 of 6"). */
  label: string;
  length?: number;
}

/**
 * A one-time code's six boxes (AUTH-05, the prototype's `.otp`): 52 px boxes that advance as each digit is typed,
 * step back on Backspace, and take a whole pasted code at once; red, with the reason under them, when it was wrong.
 */
export function CodeBoxes({
  value,
  onChange,
  error,
  disabled = false,
  label,
  length = 6,
}: CodeBoxesProps): React.JSX.Element {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  function setDigitAt(index: number, digit: string): void {
    const next = [...digits];
    next[index] = digit;
    onChange(next.join('').replace(/\s+$/, ''));
  }

  function handleChange(index: number, raw: string): void {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigitAt(index, digit);
    if (digit !== '' && index < length - 1) boxes.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      boxes.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted === '') return;
    event.preventDefault();
    onChange(pasted);
    boxes.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex justify-between gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            disabled={disabled}
            aria-label={`${label} ${String(index + 1)}/${String(length)}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              handleChange(index, event.target.value);
            }}
            onKeyDown={(event) => {
              handleKeyDown(index, event);
            }}
            onPaste={handlePaste}
            className={[
              'num h-[52px] w-0 min-w-0 flex-1 rounded-[8px] border bg-surface text-center text-[22px] font-semibold outline-none focus:border-2',
              error ? 'border-danger' : 'border-line-strong focus:border-primary',
            ].join(' ')}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          <Icon name="alert" className="inline align-baseline" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
