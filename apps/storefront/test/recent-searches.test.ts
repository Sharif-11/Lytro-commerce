import { describe, expect, it } from 'vitest';
import { RecentSearches, type RecentStorage } from '../src/lib/search/recent-searches';

function memory(initial: string | null = null): RecentStorage {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe('RecentSearches (Slice 12b)', () => {
  it('keeps the last five searches, newest first, each once whatever its letter case', () => {
    const recent = new RecentSearches(memory());
    for (const search of ['saree', 'panjabi', 'hijab', 'lungi', 'frock', 'Saree ', '  ']) {
      recent.remember(search);
    }
    expect(recent.list()).toEqual(['Saree', 'frock', 'lungi', 'hijab', 'panjabi']);
  });

  it('reads nothing from a broken or blocked store', () => {
    expect(new RecentSearches(memory('{not json')).list()).toEqual([]);
    expect(new RecentSearches(memory('[1, "ok"]')).list()).toEqual(['ok']);
    const blocked = new RecentSearches(null);
    blocked.remember('saree');
    expect(blocked.list()).toEqual([]);
  });
});
