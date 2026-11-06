import { useState } from 'react';

/** A download a button starts: busy while it runs, and why it failed, for a banner under it. */
export function useDownload(): {
  busy: boolean;
  error: unknown;
  run: (download: () => Promise<void>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (download: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await download();
    } catch (failed) {
      setError(failed);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
