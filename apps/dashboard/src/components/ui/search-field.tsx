import { Icon } from '@/components/icon';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Its name for screen readers, since the placeholder goes once something is typed. */
  label: string;
  autoFocus?: boolean;
}

/** A search box (the prototype's `.search`): 44 px, the magnifier, and the field taking the rest of the row. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
}: SearchFieldProps): React.JSX.Element {
  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-line-strong bg-surface px-3 text-[16px] text-fg-subtle focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus">
      <Icon name="search" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:appearance-none"
      />
    </label>
  );
}
