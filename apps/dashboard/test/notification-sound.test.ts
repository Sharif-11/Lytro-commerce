import { describe, expect, it } from 'vitest';
import { NotificationSound } from '../src/lib/notification-sound';

// The owner, 2026-11-19: "new notification with sharp sound". On unless this device switched it off; two quick notes.

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

class CountedAudio {
  static notes: number[] = [];
  currentTime = 0;
  destination = {};
  resume(): Promise<void> {
    return Promise.resolve();
  }
  createOscillator() {
    const tone = {
      type: '',
      frequency: { value: 0 },
      connect: (next: unknown) => next,
      start: () => {
        CountedAudio.notes.push(tone.frequency.value);
      },
      stop: () => undefined,
    };
    return tone;
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: (next: unknown) => next,
    };
  }
}

describe('the notification sound', () => {
  it('is on until this device switches it off, and remembers', () => {
    const storage = memory();
    const sound = new NotificationSound(storage, null);
    expect(sound.isOn()).toBe(true);
    sound.setOn(false);
    expect(sound.isOn()).toBe(false);
    expect(new NotificationSound(storage, null).isOn()).toBe(false);
    sound.setOn(true);
    expect(sound.isOn()).toBe(true);
  });

  it('stays on where the browser keeps nothing', () => {
    const refusing = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const sound = new NotificationSound(refusing, null);
    expect(sound.isOn()).toBe(true);
    expect(() => {
      sound.setOn(false);
    }).not.toThrow();
  });

  it('plays two high notes, the second higher; an alert only while on', () => {
    CountedAudio.notes = [];
    const storage = memory();
    const sound = new NotificationSound(storage, CountedAudio as unknown as new () => AudioContext);
    sound.alert();
    expect(CountedAudio.notes).toHaveLength(2);
    const [first = 0, second = 0] = CountedAudio.notes;
    expect(first).toBeGreaterThan(1000);
    expect(second).toBeGreaterThan(first);
    sound.setOn(false);
    sound.alert();
    expect(CountedAudio.notes).toHaveLength(2);
    sound.play();
    expect(CountedAudio.notes).toHaveLength(4);
  });

  it('is quiet where the browser has no audio', () => {
    const sound = new NotificationSound(memory(), null);
    expect(() => {
      sound.play();
    }).not.toThrow();
  });
});
