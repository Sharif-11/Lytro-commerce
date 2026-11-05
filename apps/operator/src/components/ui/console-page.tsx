import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** The column every rebuilt screen sits in: at most 1120 px wide, from the content's left edge. */
export function ConsolePage({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-full w-full max-w-page flex-col gap-4 px-4 pt-4 pb-7 sm:gap-5 sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pt-7 lg:pb-12">
      {children}
    </div>
  );
}

/** A screen's title, with the sentence on what it is for. */
export function PageTitle({
  title,
  lead,
  tag,
}: {
  title: string;
  lead?: ReactNode;
  tag?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <h1 className="text-[22px] leading-[1.3] font-bold tracking-[-0.01em] lg:text-[24px]">
        {title} {tag}
      </h1>
      {lead ? <div className="mt-0.5 max-w-[720px] text-[14px] text-fg-muted">{lead}</div> : null}
    </div>
  );
}

/** The console's card: flat, with a hairline. */
export function ConsoleCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface p-4 ${className}`}>
      {children}
    </section>
  );
}

/** Marks what is drawn for later work: on a page's title, or dashed in the sidebar. */
export function SoonTag({ dashed = false }: { dashed?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-[7px] align-middle text-[11px] font-semibold tracking-[0.04em] text-neutral-700 uppercase bn:tracking-normal bn:normal-case ${
        dashed ? 'border border-dashed border-line-strong bg-transparent' : 'bg-neutral-100'
      }`}
    >
      {t('shell.soon')}
    </span>
  );
}
