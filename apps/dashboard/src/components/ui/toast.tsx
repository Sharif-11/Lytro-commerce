import { Icon, type IconName } from '@/components/icon';

/**
 * A message after a save or a change (the prototype's `.toast`): ink, over the tab bar on a phone, 360 px in the
 * bottom right corner from 1024 px, the check at its start and the words across from it, as every drawn toast has
 * them -- or the info mark where nothing was done yet (Part 28's `dom28-checked`). It clears itself (useToast).
 */
export function Toast({
  message,
  icon = 'check',
}: {
  message: string | null;
  icon?: IconName;
}): React.JSX.Element | null {
  if (message === null) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] left-4 z-30 flex justify-between gap-3 rounded-[10px] bg-ink px-4 py-3 text-[14px] text-white shadow-[0_1px_2px_rgba(16,32,31,0.06),0_4px_12px_rgba(16,32,31,0.06)] lg:right-8 lg:bottom-8 lg:left-auto lg:w-[360px]"
    >
      <span aria-hidden="true" className="flex flex-none">
        <Icon name={icon} />
      </span>
      <span>{message}</span>
    </div>
  );
}
