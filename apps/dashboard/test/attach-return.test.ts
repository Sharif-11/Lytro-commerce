import { describe, expect, it } from 'vitest';
import { AttachReturnStore } from '../src/session/attach-return';

describe('the shop a connect returns to (AUTH-27)', () => {
  it('is given back once, then forgotten', () => {
    const store = new AttachReturnStore(sessionStorage);
    store.remember('megh');
    expect(store.take()).toBe('megh');
    expect(store.take()).toBeNull();
  });

  it('is simply absent where the browser keeps nothing', () => {
    const store = new AttachReturnStore(null);
    store.remember('megh');
    expect(store.take()).toBeNull();
  });
});
