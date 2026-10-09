import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

/** A segmented one-time-code input (one box per digit) — the shared OTP control for both the sign-up/
    sign-in and forgot-password verify screens. */
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
      <div className="flex justify-center gap-2">
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
            aria-label={`Digit ${String(index + 1)}`}
            className={`h-14 w-11 rounded-xl border bg-white text-center text-xl font-semibold text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 ${
              error
                ? 'border-red-300 focus:border-red-400 focus:ring-red-400/30'
                : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500/30'
            }`}
          />
        ))}
      </div>
      {error ? <p className="mt-2 text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
