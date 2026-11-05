import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { environmentOf } from '@/lib/environment';
import { useOtherLanguage } from '@/lib/use-other-language';

/** Whether a key press is someone typing, rather than a shortcut for the page. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * The top bar from 1024 px: the shop search with its `/` key (rule 7), which deployment this is, and the language. A
 * search opens Shops when it is sent, not when the field gets focus, so tabbing past it leaves the screen alone.
 */
export function TopBar(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useOtherLanguage();
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      // Under 1024 px this bar isn't drawn; a keyboard there goes to Shops, where the search is.
      if (field.current?.offsetParent) field.current.focus();
      else void navigate({ to: '/shops' });
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [navigate]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const q = query.trim();
    void navigate({ to: '/shops', search: q ? { q } : {} });
  }

  return (
    <header className="hidden h-14 flex-none items-center gap-3 border-b border-line bg-surface px-6 lg:flex">
      <form
        role="search"
        onSubmit={handleSubmit}
        className="flex h-[38px] max-w-[460px] flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-fg-subtle focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring"
      >
        <ConsoleIcon name="search" />
        <input
          ref={field}
          type="search"
          aria-label={t('shell.search')}
          placeholder={t('shell.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder"
        />
        <span className="ml-auto rounded border border-b-2 border-line-strong bg-surface px-[5px] py-px font-mono text-[11px] text-neutral-700">
          /
        </span>
      </form>
      <span className="flex-1" />
      <span className="rounded-full border border-line-strong px-2 py-[3px] text-[11px] font-semibold tracking-[0.06em] text-neutral-700 uppercase bn:tracking-normal bn:normal-case">
        {t(`shell.environments.${environmentOf(window.location.hostname)}`)}
      </span>
      <button
        type="button"
        lang={language.lang}
        onClick={language.change}
        className="rounded-control border border-line-strong px-2.5 py-[5px] text-[13px] font-semibold text-neutral-700 hover:bg-neutral-50"
      >
        {language.label}
      </button>
    </header>
  );
}
