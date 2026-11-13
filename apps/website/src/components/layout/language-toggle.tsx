'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { languageCookie, type Language } from '@/lib/i18n/language';

/** বাং / EN, the sketch's pill (site.css `.lang`): each button a 44 px target with the visible pill drawn inside it.
    Writes the per-device cookie and re-renders the page on the server in the other language, so the whole site
    switches at once (I18N-01) and the next visit opens in the chosen one. */
export function LanguageToggle({ language }: { language: Language }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Language) => {
    if (next === language) return;
    document.cookie = languageCookie.serialize(next);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={language === 'bn' ? 'ভাষা' : 'Language'}
      className={pending ? 'lang pending' : 'lang'}
    >
      {(['bn', 'en'] as const).map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === language}
          onClick={() => {
            choose(option);
          }}
        >
          {option === 'bn' ? 'বাং' : 'EN'}
        </button>
      ))}
    </div>
  );
}
