'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { type Language, languageCookieValue, Words } from '@/lib/i18n/words';
import { Icon } from './icon';

/** I18N-01/02: writes the per-device cookie and renders the page again on the server in the other language, so the
    whole page switches at once and the next visit opens in it. As the header's pill or as a footer link. */
export function LanguageSwitch({ language, as }: { language: Language; as: 'pill' | 'link' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const words = new Words(language);
  const other: Language = language === 'bn' ? 'en' : 'bn';
  const toggle = () => {
    document.cookie = languageCookieValue(other);
    startTransition(() => {
      router.refresh();
    });
  };
  if (as === 'link') {
    return (
      <a
        href="#"
        lang={other}
        onClick={(event) => {
          event.preventDefault();
          toggle();
        }}
      >
        {words.t('language')}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="langpill"
      lang={other}
      onClick={toggle}
      style={pending ? { opacity: 0.7 } : undefined}
    >
      <Icon name="globe" />
      {words.t('language')}
    </button>
  );
}
