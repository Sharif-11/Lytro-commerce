'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Puts what the header opens -- the search overlay, the cart drawer and its sheets -- into the page's shell, where the
    prototype draws them, rather than inside the header, which is a layer of its own. Nothing until the page runs. */
export function InShell({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    setHost(document.querySelector('.shell'));
  }, []);
  return host ? createPortal(children, host) : null;
}
