import type { ReactNode } from 'react';

/** A filter as the sketch draws one: a small label over a 40 px control. */
export function Pick({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-semibold text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

/** A field's label, for a field drawn without the shared text field. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-label font-field-label text-field-label">
      {children}
    </label>
  );
}
