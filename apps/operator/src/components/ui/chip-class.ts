const CHIP =
  'inline-flex h-[34px] flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap';

/** How a filter looks, for a button or for a link between screens. */
export function chipClass(on: boolean): string {
  return `${CHIP} ${on ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-neutral-700'}`;
}
