import type { ReactNode } from 'react';

/** A taka amount, the sign inside the field as drawn; `sign` gives a dollar price its own (Slice 8.8). */
export function MoneyField({
  label,
  name,
  value,
  onChange,
  hint,
  error,
  required = true,
  startHere = true,
  sign = '৳',
  disabled = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** Whether the panel opens with the cursor here, when it is the panel's one field. */
  startHere?: boolean;
  sign?: string;
  /** Shown but not typed, such as a price the server sets. */
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label className="block" htmlFor={name}>
      <span className="mb-1.5 block text-label font-field-label text-field-label">{label}</span>
      <span
        className={`relative flex min-h-field items-center rounded-control border focus-within:ring-2 ${
          disabled ? 'bg-neutral-50' : 'bg-field'
        } ${
          error
            ? 'border-danger focus-within:ring-field-error-ring'
            : 'border-control-line focus-within:border-line-active focus-within:ring-field-ring'
        }`}
      >
        <span className="absolute left-3 text-fg-muted">{sign}</span>
        <input
          id={name}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          required={required}
          disabled={disabled}
          data-autofocus={startHere ? true : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="mono min-w-0 flex-1 bg-transparent py-2.5 pr-3 pl-[30px] text-input text-fg focus:outline-none disabled:text-fg-muted"
        />
      </span>
      {error ? (
        <span role="alert" className="mt-1.5 block text-[13px] font-field-error text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-fg-muted">{hint}</span>
      ) : null}
    </label>
  );
}
