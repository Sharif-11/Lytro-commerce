import { useEffect, useRef, useState } from 'react';
import { useOnline } from '@/hooks/use-online';
import { BACK_ONLINE_MS, netState } from '@/lib/connection';

/**
 * The connection's state for the bar: offline while it is gone, then "Back online" for a moment after it returns, while
 * the page reads the latest again (react-query refetches on reconnect by itself).
 */
export function useNetState(): 'online' | 'offline' | 'back' {
  const online = useOnline();
  const wasOnline = useRef(online);
  const [backSince, setBackSince] = useState<number | null>(null);
  useEffect(() => {
    if (online && !wasOnline.current) setBackSince(Date.now());
    wasOnline.current = online;
  }, [online]);
  useEffect(() => {
    if (backSince === null) return;
    const timer = window.setTimeout(() => {
      setBackSince(null);
    }, BACK_ONLINE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [backSince]);
  return netState(online, backSince, Date.now());
}
