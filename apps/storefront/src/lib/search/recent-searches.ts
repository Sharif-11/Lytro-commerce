// CCH-12, Slice 12b: the searches a shopper made on this device, newest first, for the search overlay to offer again.
// Kept only in this browser; nothing reaches the server until a search is submitted.

const RECENT_KEY = 'lytro-recent-searches';
const RECENT_MAX = 5;

export type RecentStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class RecentSearches {
  constructor(private readonly storage: RecentStorage | null) {}

  list(): string[] {
    try {
      const stored: unknown = JSON.parse(this.storage?.getItem(RECENT_KEY) ?? '[]');
      return Array.isArray(stored)
        ? stored.filter((item): item is string => typeof item === 'string').slice(0, RECENT_MAX)
        : [];
    } catch {
      return [];
    }
  }

  /** Puts a search first, once, whatever its letter case was before. */
  remember(search: string): void {
    const text = search.replace(/\s+/gu, ' ').trim();
    if (text === '') return;
    const kept = this.list().filter((item) => item.toLowerCase() !== text.toLowerCase());
    try {
      this.storage?.setItem(RECENT_KEY, JSON.stringify([text, ...kept].slice(0, RECENT_MAX)));
    } catch {
      // A blocked store keeps search working; nothing is remembered.
    }
  }
}

export function browserRecentSearches(): RecentSearches {
  try {
    return new RecentSearches(window.localStorage);
  } catch {
    return new RecentSearches(null);
  }
}
