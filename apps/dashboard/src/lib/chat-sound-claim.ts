// LIVE-CHAT-PLAN §5.2 (LC-13): one chime per message, however many tabs heard it. Every open tab of the dashboard hears
// a message from Lytro; the first to claim its id here plays the sound, and the others stay quiet.

const SOUND_CLAIM_KEY = 'lytro.chatSoundFor';

/** Whether this tab plays the chime for `messageId`: true for the first tab to claim it, false for every later one. */
export function claimChatSound(
  messageId: string,
  store: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
): boolean {
  try {
    if (store.getItem(SOUND_CLAIM_KEY) === messageId) return false;
    store.setItem(SOUND_CLAIM_KEY, messageId);
    return true;
  } catch {
    // Storage refused (a private window): this tab can't know of the others, so it plays.
    return true;
  }
}
