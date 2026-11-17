import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { type ConnectionSignal, connectionSignal, isConnectionFailure } from './connection';
import { isSavingPaused, type SavingPausedSignal, savingPausedSignal } from './saving-paused';

/**
 * The dashboard's one query client. Every answer passes through it, so it is the one place that hears a save refused
 * while changes can't be saved (D9-14, Slice 9.9) and a save going through again, for the banner and the action bar,
 * and a change tapped while the connection was gone (item 1.1), for the shell's toast.
 */
export function createQueryClient(
  signal: SavingPausedSignal = savingPausedSignal,
  connection: ConnectionSignal = connectionSignal,
): QueryClient {
  const report = (error: unknown): void => {
    if (isSavingPaused(error)) signal.refused(error);
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: report }),
    mutationCache: new MutationCache({
      onError: (error) => {
        report(error);
        if (isConnectionFailure(error)) connection.failed();
      },
      onSuccess: () => {
        signal.saved();
      },
    }),
  });
}
