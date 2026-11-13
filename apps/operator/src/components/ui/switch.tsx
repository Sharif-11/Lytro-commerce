/**
 * An on/off switch as the sketch draws it, 40 by 24 px; `showLabel` puts its words beside it. `busy` holds it while a
 * change it saved at once is on its way, without the faded look of a switch that can't be used.
 */
export function Switch({
  checked,
  onChange,
  label,
  showLabel = false,
  disabled = false,
  busy = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
  busy?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`inline-flex items-center gap-2.5 text-left ${busy ? 'cursor-progress' : 'disabled:opacity-50'}`}
    >
      <span
        className={`relative h-6 w-10 flex-none rounded-full transition-colors duration-150 ${
          checked ? 'bg-primary' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-[3px] size-[18px] rounded-full bg-white transition-[left] duration-150 ${
            checked ? 'left-[19px]' : 'left-[3px]'
          }`}
        />
      </span>
      {showLabel ? <span className="text-[14px]">{label}</span> : null}
    </button>
  );
}
