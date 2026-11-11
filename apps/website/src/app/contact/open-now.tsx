'use client';

import { useEffect, useState } from 'react';
import { helpLineOpenAt } from '@lytronix/validators/common';

/** "Open now" or "Closed now · opens at 9 am" against the help line's hours by Dhaka's clock, every day (D8-73). Rendered
    only in the browser so the server never prints a state that is stale by the time the page is read. */
export function OpenNow({
  opensHour,
  closesHour,
  open,
  closed,
}: {
  opensHour: number;
  closesHour: number;
  open: string;
  closed: string;
}) {
  const [state, setState] = useState<'open' | 'closed' | null>(null);

  useEffect(() => {
    setState(helpLineOpenAt({ opensHour, closesHour }, new Date()) ? 'open' : 'closed');
  }, [opensHour, closesHour]);

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
