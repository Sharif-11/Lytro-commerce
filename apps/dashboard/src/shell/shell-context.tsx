import { createContext, useContext } from 'react';
import type { MeTenant } from '@/types/me';
import type { Viewer } from './hubs';
import type { ScreenMeta } from './route-meta';

/** What every piece of the shell, and a page inside it, reads about the shop and the person (§4). */
export interface ShellState {
  slug: string;
  tenant: MeTenant;
  viewer: Viewer;
  /** The signed-in person's own name, for the header's initial. */
  personName: string | null;
  /** The screen the shell frames now, from its route. */
  screen: ScreenMeta | undefined;
  /** The counts the navigation carries (GET /home): the Shop tab's pill and its section's count, and Billing's while a
      payment needs the person (BIL-19). */
  counts: { stock: number | null; billing: number | null };
  showToast: (message: string) => void;
  openPlus: () => void;
}

export const ShellContext = createContext<ShellState | null>(null);

/** The shell around the current page; only screens under `/$shop` have one. */
export function useShell(): ShellState {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('useShell is for screens inside the shop shell');
  return shell;
}
