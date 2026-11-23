import { describe, expect, it } from 'vitest';
import { CsrfTokenStore } from '../src';

/** A browser storage kept in memory, for a test without a browser. */
class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const KEY = 'lytro.test.csrf';

describe('the shared CSRF token', () => {
  it('is kept where every tab reads it, and cleared from there', () => {
    const shared = new MemoryStorage();
    const store = new CsrfTokenStore(KEY, shared, new MemoryStorage());
    expect(store.read()).toBeNull();
    store.write('csrf-1');
    expect(shared.getItem(KEY)).toBe('csrf-1');
    expect(new CsrfTokenStore(KEY, shared, new MemoryStorage()).read()).toBe('csrf-1');
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('moves a token one tab kept for itself before the change, so a deploy signs nobody out', () => {
    const shared = new MemoryStorage();
    const perTab = new MemoryStorage();
    perTab.setItem(KEY, 'csrf-old');
    expect(new CsrfTokenStore(KEY, shared, perTab).read()).toBe('csrf-old');
    expect(shared.getItem(KEY)).toBe('csrf-old');
    expect(perTab.getItem(KEY)).toBeNull();
  });

  it('prefers the shared token to an older copy a tab kept', () => {
    const shared = new MemoryStorage();
    const perTab = new MemoryStorage();
    shared.setItem(KEY, 'csrf-new');
    perTab.setItem(KEY, 'csrf-old');
    expect(new CsrfTokenStore(KEY, shared, perTab).read()).toBe('csrf-new');
  });

  it('clears a copy a tab kept too, so signing out leaves nothing behind', () => {
    const perTab = new MemoryStorage();
    perTab.setItem(KEY, 'csrf-old');
    new CsrfTokenStore(KEY, new MemoryStorage(), perTab).clear();
    expect(perTab.getItem(KEY)).toBeNull();
  });

  it('works without storage at all, as a page whose storage is blocked', () => {
    const store = new CsrfTokenStore(KEY, null, null);
    store.write('csrf-1');
    expect(store.read()).toBeNull();
    expect(() => {
      store.clear();
    }).not.toThrow();
  });
});
