import type { ReactNode, SelectHTMLAttributes } from 'react';

const control =
  'min-h-12 w-full rounded-control border border-control-line bg-field px-3.5 text-base text-fg focus:border-line-active focus:ring-2 focus:ring-field-ring focus:outline-none';

/** A labelled native select in the text field's clothes. */
export function SelectField({
  label,
  name,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; children: ReactNode }) {
  return (
    <label className="block" htmlFor={name}>
      <span className="mb-1.5 block text-label font-bold text-fg">{label}</span>
      <select id={name} name={name} {...props} className={`${control} ${className}`}>
        {children}
      </select>
    </label>
  );
}

/** A 44 px checkbox row with its label as the tap target. */
export function CheckboxRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-copy text-fg">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="h-5 w-5 rounded accent-primary"
      />
      {label}
    </label>
  );
}

/** The page header every section screen opens with. */
export function PageHeader({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="heading text-[22px] text-fg">{title}</h1>
        {lead ? <p className="mt-1 text-[14px] text-fg-muted">{lead}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A surface card, the unit every list and form sits in. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

/** A card's inner title. */
export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-bold text-fg">{children}</h2>;
}

/** The page column for section screens. */
export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div
      className={`mx-auto w-full space-y-5 px-4 py-5 sm:px-6 sm:py-6 ${narrow ? 'max-w-page-narrow' : 'max-w-page'}`}
    >
      {children}
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-copy text-fg-muted">{children}</p>;
}

/** A label and value pair for detail rows. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-bold tracking-wide text-fg-muted uppercase">{label}</p>
      <p className="num mt-0.5 text-[14px] break-words text-fg">{children}</p>
    </div>
  );
}
