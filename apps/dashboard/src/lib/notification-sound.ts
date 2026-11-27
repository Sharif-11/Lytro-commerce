// The owner, 2026-11-19: "new notification with sharp sound please" (the sketch's `snd-prefs`). A short, bright two-note
// chime made in the browser, so there is no file to load; on unless switched off on this device. Browsers let a page
// make sound only after it has been tapped or typed in, so the first touch wakes the audio.

const SETTING_KEY = 'lytro.notificationSound';

/** The two notes, a sixth apart and high, each a quick strike that dies away: sharp, never long. */
const NOTES: readonly { hz: number; at: number }[] = [
  { hz: 1318.5, at: 0 },
  { hz: 1760, at: 0.12 },
];
const NOTE_SECONDS = 0.18;
const LOUDNESS = 0.35;

type AudioContextClass = new () => AudioContext;

/** The browser's audio, under either of its names (Safari's older one); none outside a browser or without it. */
function audioClassOf(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  const named = window as unknown as {
    AudioContext?: AudioContextClass;
    webkitAudioContext?: AudioContextClass;
  };
  return named.AudioContext ?? named.webkitAudioContext ?? null;
}

function storageOf(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class NotificationSound {
  private context: AudioContext | null = null;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = storageOf(),
    private readonly audioClass: AudioContextClass | null = audioClassOf(),
    private readonly settingKey: string = SETTING_KEY,
  ) {}

  /** On unless this device switched it off. */
  isOn(): boolean {
    try {
      return this.storage?.getItem(this.settingKey) !== 'off';
    } catch {
      return true;
    }
  }

  setOn(on: boolean): void {
    try {
      this.storage?.setItem(this.settingKey, on ? 'on' : 'off');
    } catch {
      // A private window may refuse; the sound then stays as it was for this visit.
    }
  }

  /** The first tap or key on the page wakes the audio, which a browser starts asleep. */
  wakeOn(target: Pick<Window, 'addEventListener'>): void {
    const wake = (): void => {
      void this.audio()
        ?.resume()
        .catch(() => undefined);
    };
    target.addEventListener('pointerdown', wake, { once: true });
    target.addEventListener('keydown', wake, { once: true });
  }

  /** The chime, whatever the switch says (the settings' Play the sound). */
  play(): void {
    const audio = this.audio();
    if (!audio) return;
    const start = audio.currentTime + 0.01;
    for (const note of NOTES) {
      const at = start + note.at;
      const tone = audio.createOscillator();
      const level = audio.createGain();
      tone.type = 'triangle';
      tone.frequency.value = note.hz;
      level.gain.setValueAtTime(0.0001, at);
      level.gain.exponentialRampToValueAtTime(LOUDNESS, at + 0.008);
      level.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_SECONDS);
      tone.connect(level).connect(audio.destination);
      tone.start(at);
      tone.stop(at + NOTE_SECONDS + 0.02);
    }
  }

  /** The chime for a new notification, when this device has the sound on. */
  alert(): void {
    if (this.isOn()) this.play();
  }

  private audio(): AudioContext | null {
    if (this.context) return this.context;
    if (!this.audioClass) return null;
    try {
      this.context = new this.audioClass();
    } catch {
      return null;
    }
    return this.context;
  }
}

export const notificationSound = new NotificationSound();

/**
 * LIVE-CHAT-PLAN §5.6: the same chime when Lytro answers in the shop's chat, on any screen, with its own switch on this
 * device ("চ্যাট মেসেজে সাউন্ড"), on unless switched off.
 */
export const chatSound = new NotificationSound(storageOf(), audioClassOf(), 'lytro.chatSound');
