import { describe, expect, it } from 'vitest';
import { SignUpIntentStore } from '../src/session/sign-up-intent';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('SignUpIntentStore', () => {
  it('keeps the claimed address and the plan across captures', () => {
    const store = new SignUpIntentStore(new MemoryStorage());
    store.capture({ planId: 'p', termId: 't' });
    store.capture({ shop: 'megh' });
    expect(store.read()).toEqual({ shop: 'megh', planId: 'p', termId: 't' });
  });

  it('consumes the plan and the address separately', () => {
    const store = new SignUpIntentStore(new MemoryStorage());
    store.capture({ shop: 'megh', planId: 'p', termId: 't' });
    store.clearShop();
    expect(store.read()).toEqual({ shop: null, planId: 'p', termId: 't' });
    store.clearPlan();
    expect(store.read()).toEqual({ shop: null, planId: null, termId: null });
  });

  it('survives a missing storage', () => {
    const store = new SignUpIntentStore(null);
    expect(store.capture({ shop: 'megh' })).toEqual({ shop: 'megh', planId: null, termId: null });
    expect(store.read()).toEqual({ shop: null, planId: null, termId: null });
  });
});
