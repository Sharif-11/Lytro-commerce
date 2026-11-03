'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Language } from '@/lib/i18n/words';
import { Words } from '@/lib/i18n/words';
import { ORDERED_KEY } from '@/lib/order/order-form';
import { InShell } from '../in-shell';

interface InstallPrompt extends Event {
  prompt: () => Promise<unknown>;
}

const ASKED_KEY = 'lytro-install-asked';

function canOffer(): boolean {
  try {
    return (
      window.localStorage.getItem(ORDERED_KEY) === '1' &&
      window.localStorage.getItem(ASKED_KEY) !== '1'
    );
  } catch {
    return false;
  }
}

/** SFT-14, CCH-10 (`home-pwa`): the shop's app offered on its home, after a first order rather than on arrival, once the
    browser says it can be installed. Asked once: whatever the shopper answers, it does not come back. */
export function InstallCard({ language, shopName }: { language: Language; shopName: string }) {
  const words = useMemo(() => new Words(language), [language]);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (canOffer()) setPrompt(event as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);
  if (prompt === null) return null;
  return (
    <InShell>
      <div className="pwa">
        <span className="ic">{Array.from(shopName.trim())[0]?.toUpperCase()}</span>
        <span className="b">
          <b>{words.t('pwa_t', { s: shopName })}</b>
          {words.t('pwa_p')}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPrompt(null);
            try {
              window.localStorage.setItem(ASKED_KEY, '1');
            } catch {
              // Blocked storage only means it may be offered again.
            }
            void prompt.prompt();
          }}
        >
          {words.t('pwa_btn')}
        </button>
      </div>
    </InShell>
  );
}
