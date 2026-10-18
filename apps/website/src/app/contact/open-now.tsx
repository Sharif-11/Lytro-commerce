'use client';

import { useEffect, useState } from 'react';

/** "Open now" against Dhaka time: Saturday to Thursday, 10:00 to 20:00. Rendered only in the browser so the
    server never prints a state that is stale by the time the page is read. */
export function OpenNow({ open, closed }: { open: string; closed: string }) {
  const [state, setState] = useState<'open' | 'closed' | null>(null);

  useEffect(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((part) => part.type === 'weekday')?.value;
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
    const isOpen = weekday !== 'Fri' && hour >= 10 && hour < 20;
    setState(isOpen ? 'open' : 'closed');
  }, []);

  if (!state) return null;
  const tone =
    state === 'open' ? 'bg-success-soft text-success' : 'bg-neutral-100 text-neutral-700';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${tone}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${state === 'open' ? 'bg-success' : 'bg-neutral-500'}`}
        aria-hidden="true"
      />
      {state === 'open' ? open : closed}
    </span>
  );
}
