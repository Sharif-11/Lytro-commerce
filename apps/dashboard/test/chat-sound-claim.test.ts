import { describe, expect, it } from 'vitest';
import { claimChatSound } from '../src/lib/chat-sound-claim';

/** One browser's storage, which every tab of the dashboard shares. */
function sharedStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('the chat chime across tabs (LIVE-CHAT-PLAN §5.2, LC-13)', () => {
  it('plays once for a message, however many tabs heard it', () => {
    const storage = sharedStorage();
    const tabs = [1, 2, 3].map(() => claimChatSound('m-7', storage));
    expect(tabs.filter(Boolean)).toHaveLength(1);
    expect(tabs[0]).toBe(true);
  });

  it('plays again for the next message', () => {
    const storage = sharedStorage();
    expect(claimChatSound('m-7', storage)).toBe(true);
    expect(claimChatSound('m-8', storage)).toBe(true);
    expect(claimChatSound('m-8', storage)).toBe(false);
  });

  it('still plays where the browser refuses storage', () => {
    const refusing: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(claimChatSound('m-7', refusing)).toBe(true);
  });
});
