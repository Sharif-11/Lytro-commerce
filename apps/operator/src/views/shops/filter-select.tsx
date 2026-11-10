import type { ReactNode } from 'react';

// The sketch's own chevron, drawn in the select so it sits where the sketch puts it on every browser.
const CHEVRON: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232c3f3e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundPosition: 'right 12px center',
  backgroundRepeat: 'no-repeat',
};

/** A labelled filter over a list (OPERATOR-CONSOLE-DESIGN v7): its label above, the choice below. */
export function FilterSelect({
  label,
  value,
  onChange,
  wide = false,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Across the whole row on a phone. */
  wide?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'col-span-full sm:col-auto' : ''}`}>
      <span className="text-[12px] font-semibold text-neutral-700">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        style={CHEVRON}
        className="h-10 w-full appearance-none rounded-control border border-line-strong bg-surface pr-9 pl-3 text-[14px] text-ink focus:border-line-active focus:ring-2 focus:ring-field-ring focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

/** The filters' row: two across on a phone, as many as fit from 640 px. */
export function FilterRow({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {children}
    </div>
  );
}
