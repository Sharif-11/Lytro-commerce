import { createContext, useContext } from 'react';
import type { TutorialKey } from '@lytronix/validators';

export interface PlayerState {
  /** Opens Lytro's own full-screen player on this part (§7.49); closing it returns to the screen it was opened from. */
  play: (key: TutorialKey) => void;
}

export const PlayerContext = createContext<PlayerState | null>(null);

/** How a row, a chip or a list starts a video. */
export function usePlayTutorial(): (key: TutorialKey) => void {
  const state = useContext(PlayerContext);
  if (!state) throw new Error('usePlayTutorial is for screens inside the shop shell');
  return state.play;
}
