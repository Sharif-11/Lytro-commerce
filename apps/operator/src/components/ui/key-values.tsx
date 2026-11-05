import type { ReactNode } from 'react';

/** Facts in two columns, the label beside its value. */
export function KeyValues({ children }: { children: ReactNode }): React.JSX.Element {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">{children}</dl>;
}

export function KeyValue({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd
        className={`min-w-0 [overflow-wrap:anywhere] ${mono ? 'mono text-[13px]' : 'font-medium'}`}
      >
        {children}
      </dd>
    </>
  );
}
