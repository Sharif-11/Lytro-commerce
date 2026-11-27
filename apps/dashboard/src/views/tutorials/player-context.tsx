import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { TutorialKey } from '@lytronix/validators';
import { PlayerContext } from './player-hook';
import { TutorialPlayer } from './tutorial-player';

/** The tutorial player for every screen of the shop's shell, one at a time. */
export function TutorialPlayerProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [playing, setPlaying] = useState<TutorialKey | null>(null);
  const play = useCallback((key: TutorialKey) => {
    setPlaying(key);
  }, []);
  const state = useMemo(() => ({ play }), [play]);
  return (
    <PlayerContext.Provider value={state}>
      {children}
      {playing ? (
        <TutorialPlayer
          tutorialKey={playing}
          onPlay={setPlaying}
          onClose={() => {
            setPlaying(null);
          }}
        />
      ) : null}
    </PlayerContext.Provider>
  );
}
