// AUTH-27: connecting Google or Facebook from a shop's Account leaves the dashboard for the provider and comes back
// through the shared callback page, outside any shop. The shop it started from is kept for that one trip, so the
// person lands back on that shop's Account.
const STORAGE_KEY = 'lytro.attach-return';

export class AttachReturnStore {
  constructor(private readonly storage: Storage | null = AttachReturnStore.sessionStorage()) {}

  /** The shop whose Account the connect started from. */
  remember(slug: string): void {
    try {
      this.storage?.setItem(STORAGE_KEY, slug);
    } catch {
      // Losing it only lands the person on the shop picker instead.
    }
  }

  /** The shop to return to, once; null when there is none. */
  take(): string | null {
    try {
      const slug = this.storage?.getItem(STORAGE_KEY) ?? null;
      this.storage?.removeItem(STORAGE_KEY);
      return slug;
    } catch {
      return null;
    }
  }

  private static sessionStorage(): Storage | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  }
}

export const attachReturn = new AttachReturnStore();
