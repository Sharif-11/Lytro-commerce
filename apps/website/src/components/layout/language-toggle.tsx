'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { languageCookie, type Language } from '@/lib/i18n/language';

/** বাং / EN. Writes the per-device cookie and re-renders the page on the server in the other language, so
    the whole site switches at once (I18N-01) and the next visit opens in the chosen one. */
export function LanguageToggle({
  language,
  tone = 'dark',
}: {
  language: Language;
  tone?: 'dark' | 'light';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Language) => {
    if (next === language) return;
    document.cookie = languageCookie.serialize(next);
    startTransition(() => {
      router.refresh();
    });
  };

  const shell =
    tone === 'dark' ? 'border-neutral-200 bg-white' : 'border-white/30 bg-white/10 text-white';
  const active = tone === 'dark' ? 'bg-brand-700 text-white' : 'bg-white text-brand-900';
  const idle = tone === 'dark' ? 'text-neutral-700 hover:text-ink' : 'text-white/85';

  return (
    <div
      role="group"
      aria-label={language === 'bn' ? 'ভাষা' : 'Language'}
      className={`inline-flex h-10 items-center rounded-full border p-1 text-[13px] font-bold ${shell} ${pending ? 'opacity-70' : ''}`}
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
          className={`h-8 min-w-11 rounded-full px-3 transition-colors ${option === language ? active : idle}`}
        >
          {option === 'bn' ? 'বাং' : 'EN'}
        </button>
      ))}
    </div>
  );
}
