import type { ReactNode } from 'react';

/** The page column: 16 px side gutters on a phone, widening with the viewport, 1160 px at most. */
export function Container({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1160px] px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
