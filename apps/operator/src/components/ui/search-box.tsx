import { useEffect, useState } from 'react';
import { ConsoleIcon } from './console-icon';

// What typing waits before the search is sent, so a word isn't sent letter by letter.
const SETTLE_MS = 300;

/** A search field as the sketch draws one (44 px, the icon inside), sending what is typed once typing settles. */
export function SearchBox({
  label,
  value,
  onSearch,
}: {
  label: string;
  value: string;
  onSearch: (words: string) => void;
}): React.JSX.Element {
  const [typed, setTyped] = useState(value);
  useEffect(() => {
    if (typed === value) return undefined;
    const timer = window.setTimeout(() => {
      onSearch(typed);
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed, value, onSearch]);
  return (
    <div className="flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-fg-subtle focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring">
      <ConsoleIcon name="search" />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        className="min-w-0 flex-1 bg-transparent text-input text-ink outline-none placeholder:text-placeholder"
      />
    </div>
  );
}
