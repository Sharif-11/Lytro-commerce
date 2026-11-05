import type { ReactNode, SyntheticEvent } from 'react';
import { TextField } from '@lytronix/ui';

/** The bars that show how far along the sign-in is, and whose it is. */
export function Steps({
  done,
  total,
  email,
}: {
  done: number;
  total: number;
  email: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-fg-muted">
      {Array.from({ length: total }, (_, index) => (
        <i
          key={index}
          className={`inline-block h-1 w-[22px] rounded-sm ${index < done ? 'bg-primary' : 'bg-neutral-200'}`}
        />
      ))}
      <span className="min-w-0 truncate">{email}</span>
    </div>
  );
}

export function StepHeading({ title, lead }: { title: string; lead: string }): React.JSX.Element {
  return (
    <div>
      <h1 className="text-[22px] font-bold">{title}</h1>
      <div className="text-[14px] text-fg-muted">{lead}</div>
    </div>
  );
}

export function FormCard({
  onSubmit,
  children,
}: {
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <form
      onSubmit={onSubmit}
      className="flex min-w-0 flex-col gap-3.5 rounded-card border border-line bg-surface p-4"
    >
      {children}
    </form>
  );
}

/** The one large field a code goes in. */
export function CodeField({
  label,
  value,
  onChange,
  error,
  digitsOnly = false,
  startHere = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** A numeric keypad, for where only an authenticator's code will do: a backup code has letters. */
  digitsOnly?: boolean;
  /** Puts the cursor here, where the code is all the step asks; a phone's keyboard opens with it. */
  startHere?: boolean;
}): React.JSX.Element {
  return (
    <TextField
      label={label}
      name="code"
      autoComplete="one-time-code"
      inputMode={digitsOnly ? 'numeric' : 'text'}
      required
      minLength={6}
      mono
      autoFocus={startHere}
      placeholder="000 000"
      error={error}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className="h-[54px] text-center text-[22px]! tracking-[0.2em]"
    />
  );
}
