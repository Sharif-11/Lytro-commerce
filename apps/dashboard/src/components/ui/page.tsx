import type { ReactNode } from 'react';

/**
 * A page's frame (the prototype's `.page`): a column of blocks, 16 px apart on a phone and 24 px from 640 px,
 * padded 16, 24 and 32 px, at most 1120 px wide and centred from 1024 px. Bangla runs at a 1.6 line height.
 */
export function PageFrame({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="mx-auto flex min-h-full w-full flex-col gap-4 px-4 pt-4 pb-6 sm:gap-6 sm:p-6 lg:max-w-[1120px] lg:p-8 [html[lang=bn]_&]:leading-[1.6]">
      {children}
    </div>
  );
}

interface PageTitleProps {
  children: ReactNode;
  /** Shown beside the title, on its right (a button, a count). */
  actions?: ReactNode;
  /** A line under the title. */
  sub?: ReactNode;
}

/** A page's own title (the prototype's `.ttl`): 22 px, and not shown from 1024 px, where the header carries it. */
export function PageTitle({ children, actions, sub }: PageTitleProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
      <div className="min-w-0 flex-[1_1_auto] lg:hidden">
        <h1 className="text-[22px] leading-[1.3] font-bold">{children}</h1>
        {sub ? <p className="mt-0.5 text-[14px] text-fg-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="ml-auto flex flex-none flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** A block's heading, with an optional link on its right (the prototype's `.sechead`). */
export function SectionHead({
  children,
  link,
}: {
  children: ReactNode;
  link?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[17px] font-semibold">{children}</h2>
      {link ? (
        <span className="inline-flex items-center gap-1 text-[14px] font-medium whitespace-nowrap text-primary [&_a]:no-underline">
          {link}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A small label over a group (the prototype's `.eyebrow`): 12 px marigold capitals in English; in Bangla 14 px,
 * never uppercased (TENANT-DASHBOARD-DESIGN §9).
 */
export function Eyebrow({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="text-[12px] font-semibold tracking-[0.06em] text-accent-text uppercase [html[lang=bn]_&]:text-[14px] [html[lang=bn]_&]:tracking-normal [html[lang=bn]_&]:normal-case">
      {children}
    </div>
  );
}

/** Which phase or slice brings something not built yet (the prototype's `.phase`). */
export function PhasePill({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="inline-flex h-[18px] items-center rounded-full bg-neutral-100 px-1.5 text-[11px] font-semibold whitespace-nowrap text-fg-muted">
      {children}
    </span>
  );
}
