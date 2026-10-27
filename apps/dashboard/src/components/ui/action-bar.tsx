import type { ReactNode } from 'react';

/**
 * A page's own action (the prototype's `.actionbar`, Shop details' Save): held at the foot of the page on a phone and
 * a tablet, edge to edge over a hairline, its button the bar's width; from 1024 px above the content, at its right,
 * 160 px at least.
 */
export function ActionBar({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="sticky bottom-0 z-[5] -mx-4 mt-2 -mb-6 flex gap-2 border-t border-line bg-surface px-4 pt-3 pb-5 sm:-mx-6 sm:px-6 sm:pb-4 lg:static lg:order-first lg:m-0 lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 [&>*]:flex-1 lg:[&>*]:min-w-40 lg:[&>*]:flex-none">
      {children}
    </div>
  );
}
