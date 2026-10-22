import type { Permission } from '@lytronix/validators';
import type { HubId, SectionId, ShopPath } from './hubs';

/** What the shell reads from the screen it frames (TENANT-DASHBOARD-DESIGN §4). */
export interface ScreenMeta {
  hub: HubId;
  section?: SectionId;
  /** What a screen outside any section needs (search needs `products:read`); a section's own rule covers the rest. */
  needs?: readonly Permission[];
  /** The title's key in the shell dictionary; the shop's name when absent (a hub's own page). */
  title?: string;
  /** A screen below its hub: the app bar trades the shop's name for back to here and the title. */
  back?: ShopPath;
  /**
   * A screen of the first build, framed by this shell until its own pull request rebuilds it (agreed for Slice
   * 11.3): the shell adds the banners and the section chips above it, and leaves the rest as it was.
   */
  legacy?: boolean;
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    screen?: ScreenMeta;
  }
}
