import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

/** Six boxes, auto-advance, backspace back, and a pasted full code fills every box (AUTH-05). */
export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  disabled = false,
}: OtpInputProps): React.JSX.Element {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  function setDigitAt(index: number, digit: string): void {
    const next = [...digits];
    next[index] = digit;
    onChange(next.join('').replace(/\s+$/, ''));
  }

  function handleChange(index: number, raw: string): void {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigitAt(index, digit);
    if (digit !== '' && index < length - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted === '') return;
    event.preventDefault();
    onChange(pasted);
    inputsRef.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div>
      <div className="flex justify-between gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(event) => {
              handleChange(index, event.target.value);
            }}
            onKeyDown={(event) => {
              handleKeyDown(index, event);
            }}
            onPaste={handlePaste}
            aria-label={`${String(index + 1)}/${String(length)}`}
            className={`num h-14 min-w-0 flex-1 rounded-control border bg-white text-center text-[22px] font-bold text-ink transition focus:ring-2 focus:outline-none ${
              error
                ? 'border-danger focus:ring-danger/25'
                : 'border-neutral-200 focus:border-brand-700 focus:ring-brand-500/25'
            }`}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-center text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
