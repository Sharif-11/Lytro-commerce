import type { ReactNode } from 'react';
import { ConsoleWordmark, Eyebrow, OperatorTile } from './lockup';

/** The sign-in screens' frame: the operator lockup over one narrow column, nothing else. */
export function AuthFrame({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <main className="flex min-h-dvh flex-col bg-page leading-[1.45] text-fg">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-4 pt-6 pb-10 lg:mt-12">
        <div className="flex items-center gap-3 pt-2 pb-1">
          <OperatorTile size={44} />
          <div className="flex flex-col gap-0.5">
            <Eyebrow onLight />
            <ConsoleWordmark size={24} onLight />
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
