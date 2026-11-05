import type { ReactNode } from 'react';

/** A taka amount, the sign inside the field as drawn. */
export function MoneyField({
  label,
  name,
  value,
  onChange,
  hint,
  error,
  required = true,
  startHere = true,
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
}): React.JSX.Element {
  return (
    <label className="block" htmlFor={name}>
      <span className="mb-1.5 block text-label font-field-label text-field-label">{label}</span>
      <span
        className={`relative flex min-h-field items-center rounded-control border bg-field focus-within:ring-2 ${
          error
            ? 'border-danger focus-within:ring-field-error-ring'
            : 'border-control-line focus-within:border-line-active focus-within:ring-field-ring'
        }`}
      >
        <span className="absolute left-3 text-fg-muted">৳</span>
        <input
          id={name}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          required={required}
          data-autofocus={startHere ? true : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="mono min-w-0 flex-1 bg-transparent py-2.5 pr-3 pl-[30px] text-input text-fg focus:outline-none"
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
