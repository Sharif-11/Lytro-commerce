import { io, type Socket } from 'socket.io-client';
import { CHAT_SOCKET_PATH, ChatSocketEvent, type ChatLiveMessage } from '@lytronix/validators';

/** LC-4: the console's chat sound, on this browser: the shops' sharp chime, a softer one, or none. */
export type ChatSoundChoice = 'chime' | 'soft' | 'none';

const SOUND_KEY = 'lytro.operator.chatSound';
const NOTES: Readonly<Record<Exclude<ChatSoundChoice, 'none'>, readonly number[]>> = {
  chime: [1318.5, 1760],
  soft: [659.25, 880],
};

type AudioContextClass = new () => AudioContext;

/**
 * LC-4 (the owner: "a notification option in operator with optional sounds like seller has now"): the same two-note
 * chime the dashboard makes, chosen on this browser. Browsers allow sound only after the page was touched once.
 */
export class ChatSound {
  private context: AudioContext | null = null;

  choice(): ChatSoundChoice {
    try {
      const kept = window.localStorage.getItem(SOUND_KEY);
      return kept === 'soft' || kept === 'none' ? kept : 'chime';
    } catch {
      return 'chime';
    }
  }

  choose(choice: ChatSoundChoice): void {
    try {
      window.localStorage.setItem(SOUND_KEY, choice);
    } catch {
      // A private window may refuse; the choice then lasts this visit.
    }
  }

  wakeOn(target: Pick<Window, 'addEventListener'>): void {
    const wake = (): void => {
      void this.audio()
        ?.resume()
        .catch(() => undefined);
    };
    target.addEventListener('pointerdown', wake, { once: true });
    target.addEventListener('keydown', wake, { once: true });
  }

  play(choice: ChatSoundChoice = this.choice()): void {
    if (choice === 'none') return;
    const audio = this.audio();
    if (!audio) return;
    const start = audio.currentTime + 0.01;
    NOTES[choice].forEach((hz, at) => {
      const when = start + at * 0.12;
      const tone = audio.createOscillator();
      const level = audio.createGain();
      tone.type = 'triangle';
      tone.frequency.value = hz;
      level.gain.setValueAtTime(0.0001, when);
      level.gain.exponentialRampToValueAtTime(0.35, when + 0.008);
      level.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      tone.connect(level).connect(audio.destination);
      tone.start(when);
      tone.stop(when + 0.2);
    });
  }

  private audio(): AudioContext | null {
    if (this.context) return this.context;
    const named = window as unknown as {
      AudioContext?: AudioContextClass;
      webkitAudioContext?: AudioContextClass;
    };
    const Class = named.AudioContext ?? named.webkitAudioContext;
    if (!Class) return null;
    try {
      this.context = new Class();
    } catch {
      return null;
    }
    return this.context;
  }
}

export const chatSound = new ChatSound();

/** LC-3: the console's live connection to every chat, one per tab. */
export class ChatLive {
  private socket: Socket | null = null;

  connect(events: {
    onMessage: (message: ChatLiveMessage) => void;
    onRead: () => void;
    onState: (connected: boolean) => void;
  }): void {
    this.close();
    const socket = io({
      path: CHAT_SOCKET_PATH,
      transports: ['websocket'],
      withCredentials: true,
      auth: { side: 'lytro' },
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
    });
    socket.on('connect', () => {
      events.onState(true);
    });
    socket.on('disconnect', () => {
      events.onState(false);
    });
    socket.on('connect_error', () => {
      events.onState(false);
    });
    socket.on(ChatSocketEvent.Message, (message: ChatLiveMessage) => {
      events.onMessage(message);
    });
    socket.on(ChatSocketEvent.Read, () => {
      events.onRead();
    });
    this.socket = socket;
  }

  close(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
