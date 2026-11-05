import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useShellCounts } from '@/api/shell-counts';
import { ToastProvider } from '@/components/ui/toast';
import { Band } from './band';
import { MoreSheet } from './more-sheet';
import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';
import { TopBar } from './top-bar';

/**
 * The frame around every console screen (OPERATOR-CONSOLE-DESIGN §1): from 1024 px the sidebar and the top bar, under it
 * the ink band with the menu, and on a phone the four tabs. Only the screen itself scrolls.
 */
export function ConsoleShell({ children }: { children: ReactNode }): React.JSX.Element {
  const counts = useShellCounts();
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const screen = useRef<HTMLElement>(null);

  useEffect(() => {
    screen.current?.scrollTo({ top: 0 });
  }, [pathname]);

  function openMore(): void {
    setMoreOpen(true);
  }

  return (
    <ToastProvider>
      <div className="flex h-dvh flex-col bg-page text-fg">
        <Band onMenu={openMore} />
        <div className="flex min-h-0 flex-1">
          <Sidebar counts={counts} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TopBar />
            <main ref={screen} className="min-h-0 flex-1 overflow-auto">
              {children}
            </main>
            <TabBar counts={counts} onMore={openMore} />
          </div>
        </div>
        <MoreSheet
          open={moreOpen}
          onClose={() => {
            setMoreOpen(false);
          }}
        />
      </div>
    </ToastProvider>
  );
}
