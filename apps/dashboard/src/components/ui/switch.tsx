interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What it switches, for assistive technology; the row beside it shows the words. */
  label: string;
  disabled?: boolean;
}

/** An on/off switch (the prototype's `.switch`): 44 by 26 px, primary when on. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className={[
        'relative h-[26px] w-11 flex-none rounded-full transition-colors duration-150 disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-neutral-300',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] duration-150',
          checked ? 'left-[21px]' : 'left-[3px]',
        ].join(' ')}
      />
    </button>
  );
}
